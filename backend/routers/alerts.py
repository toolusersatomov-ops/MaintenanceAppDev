from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from database import db, serialize, serialize_list
from auth_utils import get_current_user, require_roles, new_id, now_iso, ANY_SUPERVISOR
from utils import push_progress, push_notification, log_activity
from workflow import create_replacement_pipeline

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("")
async def list_alerts(status: Optional[str] = None, machine_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    if machine_id:
        query["machine_id"] = machine_id
    alerts = await db.alerts.find(query).sort("created_at", -1).to_list(1000)
    return serialize_list(alerts)


@router.get("/{alert_id}")
async def get_alert(alert_id: str, user: dict = Depends(get_current_user)):
    alert = await db.alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return serialize(alert)


class AssignBody(BaseModel):
    operations_staff: str
    create_kitchen_ticket: bool = True


@router.post("/{alert_id}/assign-staff-only")
async def assign_staff_only(alert_id: str, body: dict, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    alert = await db.alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    operations_staff = body.get("operations_staff")
    await db.alerts.update_one({"id": alert_id}, {"$set": {"assigned_operations_staff": operations_staff, "status": "Assigned"}})
    await push_progress("alert", alert_id, alert["machine_id"], "Operations Staff Assigned", by=user["username"])
    await push_notification(target_username=operations_staff, title="Assigned to Investigate Alert",
                             message=f"{alert['alert_type']}: {alert['ingredient_name']} on {alert['machine_label']}", link="/operations/dashboard")
    await log_activity(user["username"], user["role"], "Assigned operations staff to alert", {"alert_id": alert_id, "operations_staff": operations_staff})
    return {"message": f"Assigned to {operations_staff}"}


@router.post("/{alert_id}/create-kitchen-ticket-only")
async def create_kitchen_ticket_only(alert_id: str, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    alert = await db.alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.get("kitchen_prep_request_id"):
        raise HTTPException(status_code=400, detail="A Kitchen Fill Ticket already exists for this alert")
    result = await create_replacement_pipeline(
        machine_id=alert["machine_id"], slot_id=alert["slot_id"], created_by=user["username"],
        assigned_operations_staff=alert.get("assigned_operations_staff"), alert_id=alert_id, source="alert",
    )
    await db.alerts.update_one({"id": alert_id}, {"$set": {
        "status": "Assigned",
        "bin_replacement_task_id": result["bin_replacement_task_id"],
        "pickup_task_id": result["pickup_task_id"],
        "kitchen_prep_request_id": result["kitchen_prep_request_id"],
    }})
    return {"message": "Kitchen Fill Ticket created", **result}


@router.post("/{alert_id}/assign")
async def assign_alert(alert_id: str, body: AssignBody, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    alert = await db.alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert["status"] != "Open":
        raise HTTPException(status_code=400, detail="This alert has already been assigned")

    result = await create_replacement_pipeline(
        machine_id=alert["machine_id"], slot_id=alert["slot_id"], created_by=user["username"],
        assigned_operations_staff=body.operations_staff, alert_id=alert_id, source="alert",
    )

    await db.alerts.update_one({"id": alert_id}, {"$set": {
        "status": "Assigned", "assigned_operations_staff": body.operations_staff,
        "bin_replacement_task_id": result["bin_replacement_task_id"],
        "pickup_task_id": result["pickup_task_id"],
        "kitchen_prep_request_id": result["kitchen_prep_request_id"],
    }})
    return {"message": "Task assigned and Kitchen ticket created", **result}


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    alert = await db.alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert["status"] == "Open":
        raise HTTPException(status_code=400, detail="Please assign this task before acknowledging the alert.")
    await db.alerts.update_one({"id": alert_id}, {"$set": {"status": "Acknowledged"}})
    await push_progress("alert", alert_id, alert["machine_id"], "Supervisor Reviewed", by=user["username"])
    await log_activity(user["username"], user["role"], "Acknowledged alert", {"alert_id": alert_id})
    return {"message": "Alert acknowledged"}


@router.post("/{alert_id}/close")
async def close_alert(alert_id: str, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    alert = await db.alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await db.alerts.update_one({"id": alert_id}, {"$set": {"status": "Resolved"}})
    await push_progress("alert", alert_id, alert["machine_id"], "Closed", by=user["username"])
    return {"message": "Alert closed"}


# ---------------------------------------------------------------------------
# Pre-Schedule Tasks (single task scheduling)
# ---------------------------------------------------------------------------
class PreScheduleBody(BaseModel):
    machine_id: str
    slot_id: str
    operations_staff: str
    scheduled_date: Optional[str] = None
    notes: Optional[str] = None


@router.post("/pre-schedule")
async def create_pre_schedule_task(body: PreScheduleBody, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    result = await create_replacement_pipeline(
        machine_id=body.machine_id, slot_id=body.slot_id, created_by=user["username"],
        assigned_operations_staff=body.operations_staff, alert_id=None, source="pre_schedule",
    )
    doc_id = new_id()
    await db.supervisor_tasks.insert_one({
        "id": doc_id, "type": "pre_schedule", "machine_id": body.machine_id, "slot_id": body.slot_id,
        "operations_staff": body.operations_staff, "scheduled_date": body.scheduled_date, "notes": body.notes,
        "status": "Scheduled", "created_by": user["username"], "created_at": now_iso(), **result,
    })
    return {"message": "Pre-scheduled task created", "id": doc_id, **result}


@router.get("/pre-schedule/list")
async def list_pre_schedule_tasks(user: dict = Depends(get_current_user)):
    items = await db.supervisor_tasks.find({"type": "pre_schedule"}).sort("created_at", -1).to_list(1000)
    return serialize_list(items)


# ---------------------------------------------------------------------------
# Pre-Schedule Bulk Replacements
# ---------------------------------------------------------------------------
class BulkItem(BaseModel):
    slot_id: str
    ingredient_code: str


class BulkOrderBody(BaseModel):
    machine_id: str
    operations_staff: str
    items: List[BulkItem]


@router.post("/pre-schedule/bulk")
async def place_bulk_order(body: BulkOrderBody, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    if not body.items:
        raise HTTPException(status_code=400, detail="Cart is empty. Add at least one item.")
    order_id = new_id()
    created_items = []
    for item in body.items:
        result = await create_replacement_pipeline(
            machine_id=body.machine_id, slot_id=item.slot_id, created_by=user["username"],
            assigned_operations_staff=body.operations_staff, alert_id=None, source="bulk_order",
        )
        created_items.append({"slot_id": item.slot_id, "ingredient_code": item.ingredient_code, **result})

    await db.bulk_replacement_orders.insert_one({
        "id": order_id, "machine_id": body.machine_id, "operations_staff": body.operations_staff,
        "items": created_items, "status": "Placed", "created_by": user["username"], "created_at": now_iso(),
    })
    await log_activity(user["username"], user["role"], "Placed pre-scheduled bulk order",
                        {"machine_id": body.machine_id, "item_count": len(body.items)})
    return {"message": f"Bulk order placed with {len(body.items)} item(s)", "order_id": order_id, "items": created_items}


@router.get("/pre-schedule/bulk/list")
async def list_bulk_orders(user: dict = Depends(get_current_user)):
    items = await db.bulk_replacement_orders.find().sort("created_at", -1).to_list(1000)
    return serialize_list(items)
