from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from database import db, serialize, serialize_list
from auth_utils import get_current_user, require_roles, new_id, now_iso, ANY_SUPERVISOR
from seed_constants import machine_label, recipes_using
from utils import push_progress, push_notification, log_activity
from workflow import create_replacement_pipeline

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

EMAIL_ESCALATION_MIN_AGE_MINUTES = 30


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
    return await _enrich_alert(alert)


@router.get("/{alert_id}/detail")
async def get_alert_detail(alert_id: str, user: dict = Depends(get_current_user)):
    alert = await db.alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return await _enrich_alert(alert)


async def _enrich_alert(alert: dict) -> dict:
    out = serialize(alert)
    kpr = None
    if alert.get("kitchen_prep_request_id"):
        kpr = await db.kitchen_preparation_requests.find_one({"id": alert["kitchen_prep_request_id"]})
    pickup_task = None
    if alert.get("pickup_task_id"):
        pickup_task = await db.pickup_tasks.find_one({"id": alert["pickup_task_id"]})
    out["linked_kitchen_request"] = serialize(kpr) if kpr else None
    out["kitchen_ticket_created_at"] = kpr["requested_at"] if kpr else None
    out["pickup_task_status"] = pickup_task["status"] if pickup_task else None
    email_sent_logs = await db.activity_logs.count_documents({"action": "Emailed Kitchen Staff (simulated)", "details.alert_id": alert["id"]})
    out["email_already_sent"] = email_sent_logs > 0
    return out


@router.post("/ensure")
async def ensure_alert(body: dict, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    """Find-or-create an alert for a given machine+slot. Used when a machine
    control card is clicked, so duplicate alerts are never created for the
    same slot while an alert is still open/assigned."""
    machine_id = body.get("machine_id")
    slot_id = body.get("slot_id")
    if not machine_id or not slot_id:
        raise HTTPException(status_code=400, detail="machine_id and slot_id are required")

    existing = await db.alerts.find_one({"slot_id": slot_id, "status": {"$in": ["Open", "Assigned", "Acknowledged"]}})
    if existing:
        return {"id": existing["id"], "created": False}

    slot = await db.machine_slots.find_one({"id": slot_id})
    if not slot:
        raise HTTPException(status_code=404, detail="Slot not found")

    alert_type = slot.get("status") if slot.get("status") != "Normal" else "Low Stock"
    priority = "High" if alert_type in ("Low Stock", "Replacement Due") else "Medium"
    alert_id = new_id()
    alert = {
        "id": alert_id, "alert_type": alert_type, "machine_id": machine_id, "machine_label": machine_label(machine_id),
        "slot_id": slot["id"], "slot_type": slot["slot_type"], "ingredient_code": slot["ingredient_code"],
        "ingredient_name": slot["ingredient_name"], "current_quantity": slot["current_quantity"], "unit": slot["unit"],
        "current_level_pct": slot["current_level_pct"], "full_capacity": slot["capacity"], "expiry_date": slot["expiry_date"],
        "replacement_due_date": slot["replacement_due_date"], "current_bin_id": slot["current_bin_id"],
        "current_bin_qr_code_id": slot["current_bin_qr_code_id"], "priority": priority, "created_at": now_iso(),
        "recipes_affected": recipes_using(slot["ingredient_code"]),
        "suggested_action": f"Assign Operations Staff to replace the {slot['ingredient_name']} bin on {machine_label(machine_id)} and create a Kitchen Fill Ticket.",
        "status": "Open", "assigned_operations_staff": None, "bin_replacement_task_id": None,
        "pickup_task_id": None, "kitchen_prep_request_id": None,
    }
    await db.alerts.insert_one(alert)
    await push_progress("alert", alert_id, machine_id, "Alert Created", by=user["username"])
    await log_activity(user["username"], user["role"], "Alert ensured/created from Machine Control Center", {"alert_id": alert_id, "slot_id": slot_id})
    return {"id": alert_id, "created": True}


class AssignBody(BaseModel):
    operations_staff: str
    create_kitchen_ticket: bool = True


class AssignStaffBody(BaseModel):
    operations_staff: str
    start_time: Optional[str] = None
    due_time: Optional[str] = None
    priority: Optional[str] = None
    comment: Optional[str] = None
    notify: bool = True


@router.post("/{alert_id}/assign-staff-only")
async def assign_staff_only(alert_id: str, body: AssignStaffBody, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    alert = await db.alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    update = {"assigned_operations_staff": body.operations_staff, "status": "Assigned"}
    if body.start_time:
        update["assignment_start_time"] = body.start_time
    if body.due_time:
        update["assignment_due_time"] = body.due_time
    if body.priority:
        update["priority"] = body.priority
    if body.comment:
        update["assignment_comment"] = body.comment
    await db.alerts.update_one({"id": alert_id}, {"$set": update})
    await push_progress("alert", alert_id, alert["machine_id"], "Operations Staff Assigned", by=user["username"])
    if body.notify:
        await push_notification(target_username=body.operations_staff, title="Assigned to Investigate Alert",
                                 message=f"{alert['alert_type']}: {alert['ingredient_name']} on {alert['machine_label']}", link="/operations/dashboard")
    await log_activity(user["username"], user["role"], "Assigned operations staff to alert",
                        {"alert_id": alert_id, "operations_staff": body.operations_staff, "notified": body.notify})
    return {"message": f"Assigned to {body.operations_staff}" + (" and notified" if body.notify else "")}


@router.post("/{alert_id}/email-kitchen")
async def email_kitchen_escalation(alert_id: str, user: dict = Depends(require_roles(*ANY_SUPERVISOR))):
    alert = await db.alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if not alert.get("kitchen_prep_request_id"):
        raise HTTPException(status_code=400, detail="No linked Kitchen Fill Ticket. Please create one before emailing Kitchen.")
    kpr = await db.kitchen_preparation_requests.find_one({"id": alert["kitchen_prep_request_id"]})
    if not kpr:
        raise HTTPException(status_code=400, detail="No linked Kitchen Fill Ticket. Please create one before emailing Kitchen.")

    pickup_task = await db.pickup_tasks.find_one({"id": alert.get("pickup_task_id")}) if alert.get("pickup_task_id") else None
    if pickup_task and pickup_task.get("status") == "Picked":
        raise HTTPException(status_code=400, detail="This ticket has already been picked up. Email escalation is no longer applicable.")

    created_at = datetime.fromisoformat(kpr["requested_at"])
    age_minutes = (datetime.now(timezone.utc) - created_at).total_seconds() / 60
    if age_minutes < EMAIL_ESCALATION_MIN_AGE_MINUTES:
        remaining = round(EMAIL_ESCALATION_MIN_AGE_MINUTES - age_minutes, 1)
        raise HTTPException(status_code=400, detail=f"Ticket is only {round(age_minutes, 1)} min old. Please wait {remaining} more min before emailing Kitchen.")

    await log_activity(user["username"], user["role"], "Emailed Kitchen Staff (simulated)", {
        "alert_id": alert_id, "kitchen_prep_request_id": kpr["id"], "to": "kitchen01",
        "subject": f"URGENT: {alert['ingredient_name']} refill overdue on {alert['machine_label']}",
        "ticket_age_minutes": round(age_minutes, 1),
    })
    await push_notification(target_role="kitchen_staff", title="URGENT: Fill Ticket Escalated by Email",
                             message=f"{alert['ingredient_name']} on {alert['machine_label']} is overdue. Please prepare immediately.",
                             link="/kitchen/preparation-requests")
    return {"message": "Kitchen staff notified via email (simulated)."}


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
    priority: str = "Medium"
    kitchen_required: bool = True
    comment: Optional[str] = None
    operations_staff: Optional[str] = None


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
            assigned_operations_staff=item.operations_staff or body.operations_staff, alert_id=None,
            source="bulk_order", bulk_order_id=order_id, priority=item.priority,
            comment=item.comment, kitchen_required=item.kitchen_required,
        )
        created_items.append({
            "slot_id": item.slot_id, "ingredient_code": item.ingredient_code, "priority": item.priority,
            "kitchen_required_requested": item.kitchen_required, "comment": item.comment, **result,
        })

    await db.bulk_replacement_orders.insert_one({
        "id": order_id, "machine_id": body.machine_id, "machine_label": machine_label(body.machine_id),
        "operations_staff": body.operations_staff, "items": created_items, "status": "Placed",
        "created_by": user["username"], "created_at": now_iso(),
    })
    await log_activity(user["username"], user["role"], "Placed pre-scheduled bulk order",
                        {"machine_id": body.machine_id, "item_count": len(body.items)})
    return {"message": f"Bulk order placed with {len(body.items)} item(s)", "order_id": order_id, "items": created_items}


@router.get("/pre-schedule/bulk/list")
async def list_bulk_orders(user: dict = Depends(get_current_user)):
    items = await db.bulk_replacement_orders.find().sort("created_at", -1).to_list(1000)
    return serialize_list(items)
