from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from database import db, serialize, serialize_list
from auth_utils import get_current_user, require_roles, new_id, now_iso, hash_password, ANY_SUPERVISOR
from seed_constants import ROLE_LABELS, MACHINES
from utils import log_activity

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
async def live_task_progress(machine_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if machine_id:
        query["machine_id"] = machine_id
    items = await db.live_task_progress.find(query).sort("updated_at", -1).to_list(1000)
    return serialize_list(items)


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
