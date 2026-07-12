from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from database import db, serialize, serialize_list
from auth_utils import get_current_user, require_roles, new_id, now_iso, hash_password, ANY_SUPERVISOR
from seed_constants import ROLE_LABELS, MACHINES
from utils import log_activity, push_progress, push_notification

router = APIRouter(prefix="/api/supervisor", tags=["supervisor"])


@router.get("/dashboard")
async def supervisor_dashboard(user: dict = Depends(get_current_user)):
    machines = await db.machines.find().to_list(1000)
    slots = await db.machine_slots.find().to_list(5000)
    alerts = await db.alerts.find().to_list(1000)
    kitchen_reqs = await db.kitchen_preparation_requests.find().to_list(1000)
    pickup_tasks = await db.pickup_tasks.find().to_list(1000)
    dirty_bins = await db.dirty_bin_returns.find().to_list(1000)
    cleaning_tasks = await db.cleaning_tasks.find().to_list(1000)

    today = datetime.now(timezone.utc).date().isoformat()
    sales_today = await db.sales_orders.find({"date": today}).to_list(5000)

    machine_sales_count = {}
    drink_sales_count = {}
    total_amount = 0
    for s in sales_today:
        total_amount += s["amount"]
        machine_sales_count[s["machine_label"]] = machine_sales_count.get(s["machine_label"], 0) + 1
        drink_sales_count[s["drink_name"]] = drink_sales_count.get(s["drink_name"], 0) + 1

    top_machine = max(machine_sales_count, key=machine_sales_count.get) if machine_sales_count else "N/A"
    top_drink = max(drink_sales_count, key=drink_sales_count.get) if drink_sales_count else "N/A"

    completed_today = [t for t in pickup_tasks if t.get("status") == "Picked"] + \
                       [t for t in cleaning_tasks if t.get("status") == "Completed"]

    return {
        "total_machines": len(machines),
        "active_machines": len([m for m in machines if m["status"] == "Running"]),
        "machines_low_stock": len([s for s in slots if s["status"] == "Low Stock"]),
        "near_expiry_alerts": len([s for s in slots if s["status"] == "Near Expiry"]),
        "pending_kitchen_preparation": len([k for k in kitchen_reqs if k["status"] in ("Pending", "In Progress")]),
        "pending_operations_tasks": len([p for p in pickup_tasks if p["status"] != "Picked"]),
        "tasks_in_progress": len([a for a in alerts if a["status"] == "Assigned"]),
        "completed_today": len(completed_today),
        "dirty_bins_pending_return": len([d for d in dirty_bins if d["status"] == "Dirty / Returned from Machine"]),
        "cleaning_pending": len([c for c in cleaning_tasks if c.get("status") != "Completed"]),
        "today_sales": total_amount,
        "cups_sold_today": len(sales_today),
        "top_selling_machine": top_machine,
        "top_selling_drink": top_drink,
    }


@router.get("/task-assignment")
async def task_assignment_overview(user: dict = Depends(get_current_user)):
    open_alerts = await db.alerts.find({"status": "Open"}).sort("created_at", -1).to_list(1000)
    assigned_alerts = await db.alerts.find({"status": "Assigned"}).sort("created_at", -1).to_list(1000)
    return {"open_alerts": serialize_list(open_alerts), "assigned_alerts": serialize_list(assigned_alerts)}


@router.get("/live-task-progress")
async def live_task_progress(machine_id: Optional[str] = None, ingredient: Optional[str] = None,
                              ticket: Optional[str] = None, staff: Optional[str] = None,
                              status: Optional[str] = None, date: Optional[str] = None,
                              user: dict = Depends(get_current_user)):
    query = {}
    if machine_id:
        query["machine_id"] = machine_id
    items = await db.live_task_progress.find(query).sort("updated_at", -1).to_list(1000)

    enriched = []
    for it in items:
        ref_type, ref_id = it.get("ref_type"), it.get("ref_id")
        info = {"ticket_id": f"TKT-{(ref_id or '')[:8].upper()}", "task_id": ref_id,
                "ingredient_name": None, "slot_id": None, "slot_type": None,
                "assigned_operations_staff": None, "created_by": None, "status": None,
                "kitchen_prep_request_id": None, "pickup_task_id": None, "bin_replacement_task_id": None}
        ref = None
        if ref_type == "alert":
            ref = await db.alerts.find_one({"id": ref_id})
            if ref:
                info["bin_replacement_task_id"] = ref.get("bin_replacement_task_id")
                info["pickup_task_id"] = ref.get("pickup_task_id")
                info["kitchen_prep_request_id"] = ref.get("kitchen_prep_request_id")
        elif ref_type == "bin_replacement_task":
            ref = await db.bin_replacement_tasks.find_one({"id": ref_id})
            if ref:
                info["bin_replacement_task_id"] = ref_id
                info["pickup_task_id"] = ref.get("pickup_task_id")
        elif ref_type == "dirty_bin_return":
            ref = await db.dirty_bin_returns.find_one({"id": ref_id})
        elif ref_type == "cleaning_task":
            ref = await db.cleaning_tasks.find_one({"id": ref_id})
            if ref:
                info["ingredient_name"] = "Machine Cleaning & Sanitization"
        if ref:
            info["ingredient_name"] = info["ingredient_name"] or ref.get("ingredient_name")
            info["slot_id"] = ref.get("slot_id")
            info["slot_type"] = ref.get("slot_type") or ref.get("bin_type")
            info["assigned_operations_staff"] = ref.get("assigned_operations_staff") or ref.get("returned_by") or ref.get("completed_by")
            info["created_by"] = ref.get("created_by")
            info["status"] = ref.get("status")
        out = serialize(it)
        out.update(info)
        enriched.append(out)

    def keep(e):
        if ingredient and ingredient.lower() not in (e.get("ingredient_name") or "").lower():
            return False
        if ticket and ticket.lower() not in (e.get("ticket_id") or "").lower() and ticket.lower() not in (e.get("task_id") or "").lower():
            return False
        if staff and staff != (e.get("assigned_operations_staff") or ""):
            return False
        if status and status.lower() not in (e.get("status") or e.get("current_stage") or "").lower():
            return False
        if date and not (e.get("updated_at") or "").startswith(date):
            return False
        return True

    return [e for e in enriched if keep(e)]


CLEANING_DUE_DAYS = 1


@router.get("/cleaning-tracking")
async def cleaning_tracking(machine_id: Optional[str] = None, staff: Optional[str] = None,
                             status: Optional[str] = None, date: Optional[str] = None,
                             due: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Machine Cleaning & Sanitization Tracking: per-machine cleaning state built from
    Operations Staff cleaning_tasks records."""
    machines = await db.machines.find().to_list(100)
    today = datetime.now(timezone.utc).date().isoformat()
    rows = []
    for m in machines:
        if machine_id and m["id"] != machine_id:
            continue
        q = {"machine_id": m["id"]}
        if date:
            q["date"] = date
        task = await db.cleaning_tasks.find_one(q, sort=[("date", -1)])
        last_completed = await db.cleaning_tasks.find_one({"machine_id": m["id"], "status": "Completed"}, sort=[("date", -1)])

        steps = (task or {}).get("steps", [])
        done = [s for s in steps if s.get("completed")]
        photo_count = len([s for s in done if s.get("photo")])
        cleaned_by = (task or {}).get("completed_by") or next((s.get("completed_by") for s in reversed(done) if s.get("completed_by")), None)

        last_date = m.get("last_cleaning_date")
        next_due = None
        if last_date:
            next_due = (datetime.fromisoformat(last_date) + timedelta(days=CLEANING_DUE_DAYS)).isoformat()

        if task and task.get("status") == "Completed":
            row_status = "Pending Supervisor Review" if task.get("review_status") == "Pending Supervisor Review" else "Completed"
        elif task and done:
            row_status = "In Progress"
        elif next_due and next_due < now_iso():
            row_status = "Overdue"
        elif task:
            row_status = "In Progress" if done else "Not Started"
        else:
            row_status = "Overdue" if (not last_date or (next_due and next_due < now_iso())) else "Not Started"

        row = {
            "machine_id": m["id"], "machine_label": m.get("label") or m["id"],
            "cleaning_task_id": (task or {}).get("id"), "task_date": (task or {}).get("date"),
            "last_cleaning_date": last_date, "last_cleaned_by": cleaned_by or ((last_completed or {}).get("completed_by")),
            "next_cleaning_due": next_due, "status": row_status,
            "steps_completed": len(done), "steps_pending": max(len(steps) - len(done), 0),
            "total_steps": len(steps), "photo_proof_count": photo_count,
            "review_status": (task or {}).get("review_status") or "Pending",
            "supervisor_comment": (task or {}).get("supervisor_comment"),
            "is_today": (task or {}).get("date") == today,
            "steps": serialize(task)["steps"] if task else [],
            "cip": (serialize(task) or {}).get("cip") if task else None,
        }
        if staff and (row["last_cleaned_by"] or "") != staff:
            continue
        if status and row["status"] != status:
            continue
        if due == "overdue" and row["status"] != "Overdue":
            continue
        rows.append(row)
    return rows


class CleaningReviewBody(BaseModel):
    action: str  # mark_reviewed | escalate | comment
    comment: Optional[str] = None


@router.post("/cleaning-tracking/{task_id}/review")
async def review_cleaning(task_id: str, body: CleaningReviewBody, user: dict = Depends(get_current_user)):
    task = await db.cleaning_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Cleaning task not found")
    update = {}
    if body.comment:
        update["supervisor_comment"] = body.comment
    if body.action == "mark_reviewed":
        update["review_status"] = "Reviewed"
        await push_progress("cleaning_task", task_id, task["machine_id"], "Supervisor Reviewed Cleaning", by=user["username"])
    elif body.action == "escalate":
        update["review_status"] = "Escalated"
        await push_notification(target_role="operations_staff", title="Cleaning Escalated",
                                 message=f"Supervisor escalated cleaning for {task['machine_label']}: {body.comment or 'please re-check'}",
                                 link="/operations/cleaning")
        await push_progress("cleaning_task", task_id, task["machine_id"], "Cleaning Escalated by Supervisor", by=user["username"])
    elif body.action != "comment":
        raise HTTPException(status_code=400, detail="Invalid action")
    await db.cleaning_tasks.update_one({"id": task_id}, {"$set": update})
    await log_activity(user["username"], user["role"], f"Cleaning review: {body.action}", {"cleaning_task_id": task_id, "comment": body.comment})
    return {"message": "Saved"}


@router.get("/kitchen-preparation-status")
async def kitchen_preparation_status(user: dict = Depends(get_current_user)):
    items = await db.kitchen_preparation_requests.find().sort("requested_at", -1).to_list(1000)
    return serialize_list(items)


@router.get("/operations-staff-tasks")
async def operations_staff_tasks(machine_id: Optional[str] = None, status: Optional[str] = None,
                                  assigned_to: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if machine_id:
        q["machine_id"] = machine_id
    pickup_q = {**q}
    brt_q = {**q}
    if status:
        pickup_q["status"] = status
        brt_q["status"] = status
    if assigned_to:
        pickup_q["assigned_operations_staff"] = assigned_to
        brt_q["assigned_operations_staff"] = assigned_to
    pickup = await db.pickup_tasks.find(pickup_q).sort("created_at", -1).to_list(1000)
    bin_replacement = await db.bin_replacement_tasks.find(brt_q).sort("created_at", -1).to_list(1000)
    cleaning = await db.cleaning_tasks.find(q).sort("created_at", -1).to_list(1000)
    dirty = await db.dirty_bin_returns.find(q).sort("returned_at", -1).to_list(1000)
    return {
        "pickup_tasks": serialize_list(pickup),
        "bin_replacement_tasks": serialize_list(bin_replacement),
        "cleaning_tasks": serialize_list(cleaning),
        "dirty_bin_returns": serialize_list(dirty),
    }


# ---------------------------------------------------------------------------
# Task Management: reassign / priority / comment (acts on the bin
# replacement + linked pickup task as one unit)
# ---------------------------------------------------------------------------
class ReassignBody(BaseModel):
    operations_staff: str


@router.post("/tasks/{task_id}/reassign")
async def reassign_task(task_id: str, body: ReassignBody, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    task = await db.bin_replacement_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.bin_replacement_tasks.update_one({"id": task_id}, {"$set": {"assigned_operations_staff": body.operations_staff}})
    if task.get("pickup_task_id"):
        await db.pickup_tasks.update_one({"id": task["pickup_task_id"]}, {"$set": {"assigned_operations_staff": body.operations_staff}})
    await log_activity(user["username"], user["role"], "Reassigned task", {"task_id": task_id, "operations_staff": body.operations_staff})
    from utils import push_notification
    await push_notification(target_username=body.operations_staff, title="Task Reassigned to You",
                             message=f"{task['ingredient_name']} bin replacement on {task['machine_label']}", link="/operations/bin-replacement-tasks")
    return {"message": f"Task reassigned to {body.operations_staff}"}


class PriorityBody(BaseModel):
    priority: str


@router.post("/tasks/{task_id}/priority")
async def set_task_priority(task_id: str, body: PriorityBody, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    task = await db.bin_replacement_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.bin_replacement_tasks.update_one({"id": task_id}, {"$set": {"priority": body.priority}})
    await log_activity(user["username"], user["role"], "Updated task priority", {"task_id": task_id, "priority": body.priority})
    return {"message": f"Priority set to {body.priority}"}


class CommentBody(BaseModel):
    comment: str


@router.post("/tasks/{task_id}/comment")
async def add_task_comment(task_id: str, body: CommentBody, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    task = await db.bin_replacement_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    entry = {"comment": body.comment, "by": user["username"], "at": now_iso()}
    await db.bin_replacement_tasks.update_one({"id": task_id}, {"$push": {"comments": entry}})
    await log_activity(user["username"], user["role"], "Commented on task", {"task_id": task_id, "comment": body.comment})
    return {"message": "Comment added"}


# ---------------------------------------------------------------------------
# User & Access Management
# ---------------------------------------------------------------------------
class UserCreateBody(BaseModel):
    username: str
    password: str
    role: str
    name: str
    assigned_machines: List[str] = []


class UserUpdateBody(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    assigned_machines: Optional[List[str]] = None
    password: Optional[str] = None


@router.get("/users")
async def list_users(user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    users = await db.users.find().sort("username", 1).to_list(1000)
    out = serialize_list(users)
    for u in out:
        u.pop("password_hash", None)
        u["role_label"] = ROLE_LABELS.get(u["role"], u["role"])
    return out


@router.post("/users")
async def create_user(body: UserCreateBody, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    existing = await db.users.find_one({"username": body.username.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    doc = {
        "id": new_id(), "username": body.username.lower(), "password_hash": hash_password(body.password),
        "role": body.role, "name": body.name, "assigned_machines": body.assigned_machines,
        "locked": False, "failed_attempts": 0, "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    await log_activity(user["username"], user["role"], "Created user", {"username": body.username})
    out = serialize(doc)
    out.pop("password_hash")
    return out


@router.put("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdateBody, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    update = {k: v for k, v in body.model_dump().items() if v is not None and k != "password"}
    if body.password:
        update["password_hash"] = hash_password(body.password)
    await db.users.update_one({"id": user_id}, {"$set": update})
    await log_activity(user["username"], user["role"], "Updated user", {"username": target["username"]})
    return {"message": "User updated"}


@router.post("/users/{user_id}/lock")
async def lock_user(user_id: str, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": user_id}, {"$set": {"locked": True}})
    await log_activity(user["username"], user["role"], "Locked user account", {"username": target["username"]})
    return {"message": "User locked"}


@router.post("/users/{user_id}/unlock")
async def unlock_user(user_id: str, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.update_one({"id": user_id}, {"$set": {"locked": False, "failed_attempts": 0}})
    await log_activity(user["username"], user["role"], "Unlocked user account", {"username": target["username"]})
    return {"message": "User unlocked"}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await db.users.delete_one({"id": user_id})
    await log_activity(user["username"], user["role"], "Deleted user", {"username": target["username"]})
    return {"message": "User deleted"}


@router.get("/notifications")
async def supervisor_notifications(user: dict = Depends(get_current_user)):
    items = await db.notifications.find({"$or": [
        {"target_role": user["role"]}, {"target_username": user["username"]},
    ]}).sort("created_at", -1).to_list(200)
    return serialize_list(items)
