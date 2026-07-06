from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
from database import db, serialize, serialize_list
from auth_utils import get_current_user, require_roles, new_id, now_iso, ANY_OPERATIONS
from seed_constants import machine_label, CLEANING_STEPS, DOORS
from utils import push_progress, push_notification, log_activity, record_scan_action

router = APIRouter(prefix="/api/operations", tags=["operations"])


@router.get("/assigned-machines")
async def assigned_machines(user: dict = Depends(get_current_user)):
    assigned = user.get("assigned_machines", [])
    machines = await db.machines.find({"id": {"$in": assigned}}).to_list(100)
    out = []
    for m in machines:
        mid = m["id"]
        pickup_pending = await db.pickup_tasks.count_documents({"machine_id": mid, "status": {"$in": ["Ready for Pickup"]}})
        brt_pending = await db.bin_replacement_tasks.count_documents({"machine_id": mid, "status": {"$ne": "Completed"}})
        cleaning_task = await db.cleaning_tasks.find_one({"machine_id": mid}, sort=[("created_at", -1)])
        cleaning_status = cleaning_task["status"] if cleaning_task else "Not Started"
        tasks_assigned = await db.pickup_tasks.count_documents({"machine_id": mid}) + await db.bin_replacement_tasks.count_documents({"machine_id": mid})
        out.append({
            **serialize(m),
            "assigned_tasks": tasks_assigned,
            "pending_pickup_count": pickup_pending,
            "pending_bin_replacement_count": brt_pending,
            "cleaning_status": cleaning_status,
            "last_visit_time": m.get("last_visit_time"),
            "trolley_status": m.get("trolley_status", "Empty"),
        })
    return out


async def _touch_machine(machine_id: str):
    await db.machines.update_one({"id": machine_id}, {"$set": {"last_visit_time": now_iso()}})


# ---------------------------------------------------------------------------
# Pickup List
# ---------------------------------------------------------------------------
@router.get("/pickup-list")
async def pickup_list(machine_id: str, user: dict = Depends(get_current_user)):
    items = await db.pickup_tasks.find({"machine_id": machine_id}).sort("created_at", 1).to_list(200)
    return serialize_list(items)


class QrBody(BaseModel):
    machine_id: str
    qr_code_id: str


@router.post("/pickup-list/scan")
async def pickup_scan(body: QrBody, user: dict = Depends(require_roles(*ANY_OPERATIONS))):
    task = await db.pickup_tasks.find_one({"machine_id": body.machine_id, "qr_code_id": body.qr_code_id})
    if not task:
        raise HTTPException(status_code=400, detail="This Bin QR does not match any pickup item for the selected machine")
    if task["status"] == "Picked":
        raise HTTPException(status_code=400, detail="This item has already been Picked")
    if task["status"] != "Ready for Pickup":
        raise HTTPException(status_code=400, detail="Kitchen preparation is not ready yet.")

    await db.pickup_tasks.update_one({"id": task["id"]}, {"$set": {"status": "Picked"}})
    await db.saved_bins.update_one({"pickup_task_id": task["id"]}, {"$set": {"status": "Picked"}})
    await push_progress("bin_replacement_task", task["bin_replacement_task_id"], body.machine_id, "Bin QR Scanned for Pickup", by=user["username"])
    await _touch_machine(body.machine_id)
    scan = await record_scan_action("pickup-list", body.qr_code_id, "pickup_task", task["id"], "Ready for Pickup", "Picked", user["username"])
    return {"message": f"{task['ingredient_name']} marked as Picked", "task_id": task["id"], "scan_action_id": scan["id"]}


@router.post("/pickup-list/mark-all")
async def mark_all_picked(body: dict, user: dict = Depends(require_roles(*ANY_OPERATIONS))):
    machine_id = body.get("machine_id")
    tasks = await db.pickup_tasks.find({"machine_id": machine_id, "status": {"$in": ["Ready for Pickup", "Picked"]}}).to_list(200)
    if not tasks:
        raise HTTPException(status_code=400, detail="No scheduled pickup items for this machine")
    if any(t["status"] != "Picked" for t in tasks):
        raise HTTPException(status_code=400, detail="Not all scheduled items have been scanned/picked yet")

    for t in tasks:
        if t.get("bin_replacement_task_id"):
            await db.bin_replacement_tasks.update_one({"id": t["bin_replacement_task_id"]}, {"$set": {"stage": "Loaded on Trolley"}})
            await push_progress("bin_replacement_task", t["bin_replacement_task_id"], machine_id, "All Scheduled Items Picked", by=user["username"])
            await push_progress("bin_replacement_task", t["bin_replacement_task_id"], machine_id, "Loaded on Trolley", by=user["username"])

    await db.machines.update_one({"id": machine_id}, {"$set": {"trolley_status": "Loaded"}})
    await push_notification(target_role="operations_supervisor", title="Pickup Completed",
                             message=f"All scheduled items picked for {machine_label(machine_id)}", link="/supervisor/live-task-progress")
    await log_activity(user["username"], user["role"], "Marked all items picked", {"machine_id": machine_id})
    return {"message": "All scheduled items marked Picked. Supervisor notified."}


# ---------------------------------------------------------------------------
# Bin Replacement Tasks
# ---------------------------------------------------------------------------
@router.get("/bin-replacement-tasks")
async def bin_replacement_tasks(machine_id: str, user: dict = Depends(get_current_user)):
    items = await db.bin_replacement_tasks.find({"machine_id": machine_id, "status": {"$ne": "Completed"}}).sort("created_at", 1).to_list(200)
    return serialize_list(items)


@router.get("/bin-replacement-tasks/{task_id}/scan-options")
async def bin_replacement_scan_options(task_id: str, user: dict = Depends(get_current_user)):
    task = await db.bin_replacement_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    new_bin_opts = []
    saved_bin = await db.saved_bins.find_one({"pickup_task_id": task.get("pickup_task_id"), "status": "Picked"})
    if saved_bin:
        new_bin_opts = [{"qr_code_id": saved_bin["qr_code_id"], "label": f"New {task['ingredient_name']} Bin", "sublabel": saved_bin["bin_id"]}]
    slot_qr = await db.slot_qr_master.find_one({"slot_id": task["slot_id"]})
    slot_opts = [{"qr_code_id": slot_qr["qr_code_id"], "label": f"Slot {task['slot_id']}", "sublabel": task["machine_label"]}] if slot_qr else []
    old_bin_opts = [{"qr_code_id": task["old_bin_qr_code_id"], "label": f"Old {task['ingredient_name']} Bin", "sublabel": task["old_bin_id"]}] if task.get("old_bin_qr_code_id") else []
    return {"new_bin": new_bin_opts, "slot": slot_opts, "old_bin": old_bin_opts}


@router.post("/bin-replacement-tasks/{task_id}/remove-old")
async def remove_old_bin(task_id: str, user: dict = Depends(require_roles(*ANY_OPERATIONS))):
    task = await db.bin_replacement_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.bin_replacement_tasks.update_one({"id": task_id}, {"$set": {"old_bin_removed": True}})
    await push_progress("bin_replacement_task", task_id, task["machine_id"], "Old Bin Removed", by=user["username"])
    return {"message": "Old bin marked removed"}


@router.post("/bin-replacement-tasks/{task_id}/scan-new-bin")
async def scan_new_bin(task_id: str, body: dict, user: dict = Depends(require_roles(*ANY_OPERATIONS))):
    task = await db.bin_replacement_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    qr = body.get("qr_code_id")
    saved_bin = await db.saved_bins.find_one({"pickup_task_id": task.get("pickup_task_id"), "qr_code_id": qr})
    if not saved_bin:
        raise HTTPException(status_code=400, detail="This QR does not match the picked bin for this task")
    if saved_bin["status"] != "Picked":
        raise HTTPException(status_code=400, detail="This bin has not been picked from Kitchen yet")
    await db.bin_replacement_tasks.update_one({"id": task_id}, {"$set": {"new_bin_id": saved_bin["bin_id"], "new_bin_scanned": True}})
    await push_progress("bin_replacement_task", task_id, task["machine_id"], "New Bin QR Scanned", by=user["username"])
    return {"message": "New bin QR scanned", "bin_id": saved_bin["bin_id"]}


@router.post("/bin-replacement-tasks/{task_id}/scan-slot")
async def scan_slot(task_id: str, body: dict, user: dict = Depends(require_roles(*ANY_OPERATIONS))):
    task = await db.bin_replacement_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not task.get("new_bin_scanned"):
        raise HTTPException(status_code=400, detail="Scan the new bin QR first")
    qr = body.get("qr_code_id")
    slot_qr = await db.slot_qr_master.find_one({"slot_id": task["slot_id"], "qr_code_id": qr})
    if not slot_qr:
        raise HTTPException(status_code=400, detail="This Slot QR does not match the target slot for this task")

    slot = await db.machine_slots.find_one({"id": task["slot_id"]})
    saved_bin = await db.saved_bins.find_one({"bin_id": task["new_bin_id"]})

    await db.machine_slots.update_one({"id": task["slot_id"]}, {"$set": {
        "current_bin_id": task["new_bin_id"], "current_bin_qr_code_id": saved_bin["qr_code_id"] if saved_bin else None,
        "current_quantity": saved_bin["quantity"] if saved_bin else slot["capacity"],
        "current_level_pct": 100.0,
        "expiry_date": saved_bin["expiry_date"] if saved_bin else slot["expiry_date"],
        "replacement_due_date": saved_bin["replacement_due_date"] if saved_bin else slot["replacement_due_date"],
        "status": "Normal",
    }})
    await db.saved_bins.update_one({"bin_id": task["new_bin_id"]}, {"$set": {"status": "Placed in Machine"}})
    await db.bin_storage.update_one({"id": task["new_bin_id"]}, {"$set": {"status": "Placed in Machine", "location": task["machine_id"], "last_used_machine": task["machine_id"], "last_used_slot": task["slot_id"]}})
    await db.bin_replacement_tasks.update_one({"id": task_id}, {"$set": {"slot_scanned": True, "stage": "New Bin Placed in Machine"}})
    if task.get("alert_id"):
        await db.alerts.update_one({"id": task["alert_id"]}, {"$set": {"status": "Resolved"}})
    kpr = await db.kitchen_preparation_requests.find_one({"bin_replacement_task_id": task_id})
    if kpr:
        await db.kitchen_preparation_requests.update_one({"id": kpr["id"]}, {"$set": {"status": "Completed"}})

    for stage in ["Reached Machine", "Slot QR Scanned", "New Bin Placed in Machine"]:
        await push_progress("bin_replacement_task", task_id, task["machine_id"], stage, by=user["username"])
    await _touch_machine(task["machine_id"])
    return {"message": "New bin placed in machine. Machine Control Center updated."}


@router.post("/bin-replacement-tasks/{task_id}/scan-old-bin")
async def scan_old_bin(task_id: str, body: dict, user: dict = Depends(require_roles(*ANY_OPERATIONS))):
    task = await db.bin_replacement_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    qr = body.get("qr_code_id")
    if qr != task.get("old_bin_qr_code_id"):
        raise HTTPException(status_code=400, detail="This QR does not match the old bin removed from this slot")
    if task.get("old_bin_scanned"):
        raise HTTPException(status_code=400, detail="Old bin already scanned")

    dirty_id = new_id()
    await db.dirty_bin_returns.insert_one({
        "id": dirty_id, "bin_id": task["old_bin_id"], "qr_code_id": qr, "machine_id": task["machine_id"],
        "machine_label": machine_label(task["machine_id"]), "slot_id": task["slot_id"],
        "ingredient_code": task["ingredient_code"], "ingredient_name": task["ingredient_name"],
        "status": "Dirty / Returned from Machine", "returned_by": user["username"], "returned_at": now_iso(),
    })
    await db.bin_storage.update_one({"id": task["old_bin_id"]}, {"$set": {"status": "Dirty / Returned from Machine", "location": "In Transit"}})
    await db.bin_replacement_tasks.update_one({"id": task_id}, {"$set": {"old_bin_scanned": True}})
    await push_progress("bin_replacement_task", task_id, task["machine_id"], "Removed Old Bin QR Scanned", by=user["username"])
    await push_progress("bin_replacement_task", task_id, task["machine_id"], "Dirty Bin Added to Return", by=user["username"])
    scan = await record_scan_action("bin-replacement", qr, "bin_replacement_task", task_id, "In Machine", "Old Bin Removed & Dirty", user["username"])
    return {"message": "Old bin scanned and added to Dirty Bin Return", "dirty_bin_return_id": dirty_id, "scan_action_id": scan["id"]}


@router.post("/bin-replacement-tasks/{task_id}/complete")
async def complete_replacement(task_id: str, user: dict = Depends(require_roles(*ANY_OPERATIONS))):
    task = await db.bin_replacement_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not task.get("slot_scanned"):
        raise HTTPException(status_code=400, detail="New bin must be placed in the machine first")
    if not task.get("old_bin_scanned"):
        raise HTTPException(status_code=400, detail="Old bin QR must be scanned first")
    await db.bin_replacement_tasks.update_one({"id": task_id}, {"$set": {"status": "Completed", "stage": "Closed"}})
    await db.machines.update_one({"id": task["machine_id"]}, {"$set": {"trolley_status": "Empty"}})
    await push_progress("bin_replacement_task", task_id, task["machine_id"], "Closed", by=user["username"])
    await push_notification(target_role="operations_supervisor", title="Bin Replacement Completed",
                             message=f"{task['ingredient_name']} bin replaced on {machine_label(task['machine_id'])}", link="/supervisor/live-task-progress")
    await log_activity(user["username"], user["role"], "Completed bin replacement", {"task_id": task_id})
    return {"message": "Replacement Completed"}


@router.get("/bins")
async def bins_for_machine(machine_id: str, user: dict = Depends(get_current_user)):
    slots = await db.machine_slots.find({"machine_id": machine_id}).to_list(100)
    return serialize_list(slots)


# ---------------------------------------------------------------------------
# Door Control
# ---------------------------------------------------------------------------
@router.get("/door-control")
async def door_control_logs(machine_id: str, user: dict = Depends(get_current_user)):
    logs = await db.activity_logs.find({"action": "Door Control", "details.machine_id": machine_id}).sort("created_at", -1).to_list(50)
    return {"doors": DOORS, "logs": serialize_list(logs)}


class DoorActionBody(BaseModel):
    machine_id: str
    door: str
    action: str


@router.post("/door-control/action")
async def door_action(body: DoorActionBody, user: dict = Depends(require_roles(*ANY_OPERATIONS))):
    if body.door not in DOORS:
        raise HTTPException(status_code=400, detail="Invalid door")
    if body.action not in ("Open Door", "Close Door", "Confirm Door Closed"):
        raise HTTPException(status_code=400, detail="Invalid action")
    await log_activity(user["username"], user["role"], "Door Control", {"machine_id": body.machine_id, "door": body.door, "action": body.action})
    await _touch_machine(body.machine_id)
    if body.action == "Open Door":
        await push_progress("machine_door", body.machine_id, body.machine_id, "Door Opened", by=user["username"])
    return {"message": f"{body.door}: {body.action} logged"}


# ---------------------------------------------------------------------------
# Cleaning & Sanitization
# ---------------------------------------------------------------------------
@router.get("/cleaning")
async def get_cleaning_task(machine_id: str, user: dict = Depends(get_current_user)):
    today = datetime.now(timezone.utc).date().isoformat()
    task = await db.cleaning_tasks.find_one({"machine_id": machine_id, "date": today})
    if not task:
        task = {
            "id": new_id(), "machine_id": machine_id, "machine_label": machine_label(machine_id), "date": today,
            "status": "In Progress", "created_at": now_iso(),
            "steps": [{"name": s, "photo": None, "comment": "", "completed": False} for s in CLEANING_STEPS],
        }
        await db.cleaning_tasks.insert_one(task)
    return serialize(task)


class CleaningStepBody(BaseModel):
    photo: str
    comment: Optional[str] = ""


@router.post("/cleaning/{task_id}/steps/{step_index}")
async def complete_cleaning_step(task_id: str, step_index: int, body: CleaningStepBody, user: dict = Depends(require_roles(*ANY_OPERATIONS))):
    task = await db.cleaning_tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Cleaning task not found")
    if not body.photo:
        raise HTTPException(status_code=400, detail="Photo is required before marking this step complete")
    steps = task["steps"]
    if step_index < 0 or step_index >= len(steps):
        raise HTTPException(status_code=400, detail="Invalid step")
    steps[step_index] = {"name": steps[step_index]["name"], "photo": body.photo, "comment": body.comment, "completed": True}
    all_done = all(s["completed"] for s in steps)
    update = {"steps": steps}
    if all_done:
        update["status"] = "Completed"
        await db.machines.update_one({"id": task["machine_id"]}, {"$set": {"last_cleaning_date": now_iso()}})
        await push_progress("cleaning_task", task_id, task["machine_id"], "Cleaning Completed", by=user["username"])
        await push_notification(target_role="operations_supervisor", title="Cleaning Completed",
                                 message=f"Cleaning & Sanitization completed for {task['machine_label']}", link="/supervisor/live-task-progress")
    await db.cleaning_tasks.update_one({"id": task_id}, {"$set": update})
    return {"message": "Step marked complete" + (" - Cleaning fully Completed" if all_done else ""), "all_done": all_done}


# ---------------------------------------------------------------------------
# Dirty Bin Return
# ---------------------------------------------------------------------------
@router.get("/dirty-bin-return")
async def dirty_bin_return_list(machine_id: str, user: dict = Depends(get_current_user)):
    items = await db.dirty_bin_returns.find({"machine_id": machine_id, "status": "Dirty / Returned from Machine"}).sort("returned_at", -1).to_list(200)
    return serialize_list(items)


@router.post("/dirty-bin-return/scan")
async def dirty_bin_return_scan(body: QrBody, user: dict = Depends(require_roles(*ANY_OPERATIONS))):
    item = await db.dirty_bin_returns.find_one({"machine_id": body.machine_id, "qr_code_id": body.qr_code_id, "status": "Dirty / Returned from Machine"})
    if not item:
        raise HTTPException(status_code=400, detail="This QR does not match a pending dirty bin for the selected machine")
    await db.dirty_bin_returns.update_one({"id": item["id"]}, {"$set": {"status": "Returned to Kitchen"}})
    await push_progress("dirty_bin_return", item["id"], body.machine_id, "Dirty Bin Returned to Kitchen", by=user["username"])
    await push_notification(target_role="kitchen_staff", title="Dirty Bin Returned",
                             message=f"{item['ingredient_name']} bin returned from {machine_label(body.machine_id)} for cleaning", link="/kitchen/cleaning-bins")
    await push_notification(target_role="operations_supervisor", title="Dirty Bin Returned to Kitchen",
                             message=f"Bin returned from {machine_label(body.machine_id)}", link="/supervisor/live-task-progress")
    scan = await record_scan_action("dirty-bin-return", body.qr_code_id, "dirty_bin_return", item["id"], "Dirty / Returned from Machine", "Returned to Kitchen", user["username"])
    return {"message": "Marked Returned to Kitchen", "scan_action_id": scan["id"]}


@router.get("/replacement-history")
async def replacement_history(machine_id: str, user: dict = Depends(get_current_user)):
    items = await db.bin_replacement_tasks.find({"machine_id": machine_id, "status": "Completed"}).sort("created_at", -1).to_list(200)
    return serialize_list(items)


# ---------------------------------------------------------------------------
# Recent Scan Action panel (undo / confirm)
# ---------------------------------------------------------------------------
@router.get("/scan-actions/recent")
async def recent_scan_actions(screen: str, user: dict = Depends(get_current_user)):
    items = await db.qr_scan_logs.find({"screen": screen, "scanned_by": user["username"], "undone": False}).sort("scanned_at", -1).to_list(5)
    return serialize_list(items)


@router.post("/scan-actions/{scan_id}/confirm")
async def confirm_scan(scan_id: str, user: dict = Depends(require_roles(*ANY_OPERATIONS))):
    await db.qr_scan_logs.update_one({"id": scan_id}, {"$set": {"confirmed": True}})
    return {"message": "Scan confirmed"}


@router.post("/scan-actions/{scan_id}/undo")
async def undo_scan(scan_id: str, body: dict, user: dict = Depends(require_roles(*ANY_OPERATIONS))):
    scan = await db.qr_scan_logs.find_one({"id": scan_id})
    if not scan:
        raise HTTPException(status_code=404, detail="Scan action not found")
    if scan["undone"]:
        raise HTTPException(status_code=400, detail="Already undone")

    record_type = scan["affected_record_type"]
    record_id = scan["affected_record_id"]
    if record_type == "pickup_task":
        await db.pickup_tasks.update_one({"id": record_id}, {"$set": {"status": scan["status_before"]}})
        await db.saved_bins.update_one({"pickup_task_id": record_id}, {"$set": {"status": scan["status_before"]}})
    elif record_type == "dirty_bin_return":
        await db.dirty_bin_returns.update_one({"id": record_id}, {"$set": {"status": scan["status_before"]}})

    await db.qr_scan_logs.update_one({"id": scan_id}, {"$set": {
        "undone": True, "correction_comment": body.get("comment", ""),
    }})
    await push_progress(record_type, record_id, scan.get("machine_id"), "QR Scan Corrected", by=user["username"])
    await log_activity(user["username"], user["role"], "Undo QR scan (wrong scan correction)", {"scan_id": scan_id, "comment": body.get("comment", "")})
    return {"message": "Scan action undone and correction logged"}


@router.get("/notifications")
async def operations_notifications(user: dict = Depends(get_current_user)):
    items = await db.notifications.find({"$or": [
        {"target_role": "operations_staff"}, {"target_username": user["username"]},
    ]}).sort("created_at", -1).to_list(200)
    return serialize_list(items)
