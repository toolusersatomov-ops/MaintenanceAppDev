import random
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from database import db, serialize, serialize_list
from auth_utils import get_current_user, require_roles, new_id, now_iso, ANY_TECH, ANY_MAINT_SUPERVISOR
from seed_constants import machine_label, MACHINES
from utils import push_progress, push_notification, log_activity

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])
RNG = random.Random(7)

STAGE_ORDER = [
    "Accepted", "Start Travel", "Reached Machine", "Machine QR Scanned",
    "Diagnostics Started", "Diagnostics Completed", "Repair Started",
    "Testing Completed", "Submitted for Review",
]


def stage_index(stage):
    return STAGE_ORDER.index(stage) if stage in STAGE_ORDER else -1


# ---------------------------------------------------------------------------
# Technical Alerts (Maintenance Supervisor)
# ---------------------------------------------------------------------------
@router.get("/technicians")
async def list_technicians(user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    items = await db.users.find({"role": "maintenance_technician"}).to_list(50)
    out = serialize_list(items)
    for u in out:
        u.pop("password_hash", None)
    return out


@router.get("/technical-alerts")
async def technical_alerts(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"status": status} if status else {}
    items = await db.technical_alerts.find(query).sort("created_at", -1).to_list(500)
    return serialize_list(items)


class CreateWorkOrderFromAlertBody(BaseModel):
    technician: Optional[str] = None
    priority: str = "Medium"


@router.post("/technical-alerts/{alert_id}/create-work-order")
async def create_work_order_from_alert(alert_id: str, body: CreateWorkOrderFromAlertBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    alert = await db.technical_alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Technical alert not found")
    if alert.get("work_order_id"):
        raise HTTPException(status_code=400, detail="A work order already exists for this alert")
    wo_id = new_id()
    await db.maintenance_work_orders.insert_one({
        "id": wo_id, "machine_id": alert["machine_id"], "machine_label": machine_label(alert["machine_id"]),
        "type": "Breakdown", "title": alert["title"], "technical_alert_id": alert_id,
        "assigned_technician": body.technician, "status": "Assigned" if body.technician else "Open",
        "stage": None, "priority": body.priority, "created_by": user["username"], "created_at": now_iso(),
        "history": [],
    })
    await db.technical_alerts.update_one({"id": alert_id}, {"$set": {"status": "Work Order Created", "work_order_id": wo_id}})
    if body.technician:
        await push_notification(target_username=body.technician, title="New Work Order Assigned",
                                 message=f"{alert['title']} on {machine_label(alert['machine_id'])}", link="/maintenance/work-orders")
    await log_activity(user["username"], user["role"], "Created work order from alert", {"alert_id": alert_id, "work_order_id": wo_id})
    return {"message": "Work order created", "work_order_id": wo_id}


# ---------------------------------------------------------------------------
# Work Orders
# ---------------------------------------------------------------------------
@router.get("/work-orders")
async def list_work_orders(technician: Optional[str] = None, status: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if technician:
        query["assigned_technician"] = technician
    if status:
        query["status"] = status
    items = await db.maintenance_work_orders.find(query).sort("created_at", -1).to_list(500)
    return serialize_list(items)


class CreateWorkOrderBody(BaseModel):
    machine_id: str
    type: str = "Breakdown"
    title: str
    priority: str = "Medium"
    technician: Optional[str] = None


@router.post("/work-orders")
async def create_work_order(body: CreateWorkOrderBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    wo_id = new_id()
    await db.maintenance_work_orders.insert_one({
        "id": wo_id, "machine_id": body.machine_id, "machine_label": machine_label(body.machine_id),
        "type": body.type, "title": body.title, "technical_alert_id": None,
        "assigned_technician": body.technician, "status": "Assigned" if body.technician else "Open",
        "stage": None, "priority": body.priority, "created_by": user["username"], "created_at": now_iso(), "history": [],
    })
    if body.technician:
        await push_notification(target_username=body.technician, title="New Work Order Assigned",
                                 message=f"{body.title} on {machine_label(body.machine_id)}", link="/maintenance/work-orders")
    return {"message": "Work order created", "work_order_id": wo_id}


@router.post("/work-orders/{wo_id}/assign")
async def assign_technician(wo_id: str, body: dict, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    technician = body.get("technician")
    await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": {"assigned_technician": technician, "status": "Assigned"}})
    await push_notification(target_username=technician, title="New Work Order Assigned",
                             message=f"{wo['title']} on {wo['machine_label']}", link="/maintenance/work-orders")
    await log_activity(user["username"], user["role"], "Assigned technician", {"work_order_id": wo_id, "technician": technician})
    return {"message": f"Assigned to {technician}"}


@router.post("/work-orders/{wo_id}/accept")
async def accept_work_order(wo_id: str, user: dict = Depends(require_roles(*ANY_TECH))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": {"status": "Accepted", "stage": "Accepted"}, "$push": {"history": {"stage": "Accepted", "at": now_iso(), "by": user["username"]}}})
    await push_progress("work_order", wo_id, wo["machine_id"], "Accepted", by=user["username"])
    return {"message": "Work order accepted"}


class AdvanceBody(BaseModel):
    to_stage: str
    note: Optional[str] = None


@router.post("/work-orders/{wo_id}/advance")
async def advance_work_order(wo_id: str, body: AdvanceBody, user: dict = Depends(require_roles(*ANY_TECH))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    current_idx = stage_index(wo.get("stage"))
    target_idx = stage_index(body.to_stage)
    if target_idx == -1:
        raise HTTPException(status_code=400, detail="Unknown stage")
    if target_idx != current_idx + 1:
        raise HTTPException(status_code=400, detail=f"Cannot jump to '{body.to_stage}' from current stage")
    update = {"stage": body.to_stage}
    if body.to_stage == "Submitted for Review":
        update["status"] = "Pending Review"
    await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": update, "$push": {
        "history": {"stage": body.to_stage, "at": now_iso(), "by": user["username"], "note": body.note},
    }})
    await push_progress("work_order", wo_id, wo["machine_id"], body.to_stage, by=user["username"])
    if body.to_stage == "Submitted for Review":
        await push_notification(target_role="maintenance_supervisor", title="Work Order Submitted for Review",
                                 message=f"{wo['title']} on {wo['machine_label']} ready for review", link="/maintenance-supervisor/work-orders")
    return {"message": f"Advanced to {body.to_stage}"}


class ReviewBody(BaseModel):
    decision: str  # approve | reopen
    comment: Optional[str] = None


@router.post("/work-orders/{wo_id}/review")
async def review_work_order(wo_id: str, body: ReviewBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if body.decision == "approve":
        await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": {"status": "Closed", "stage": "Closed", "closed_at": now_iso()}})
        await push_progress("work_order", wo_id, wo["machine_id"], "Supervisor Reviewed", by=user["username"])
        await push_progress("work_order", wo_id, wo["machine_id"], "Closed", by=user["username"])
        if wo.get("technical_alert_id"):
            await db.technical_alerts.update_one({"id": wo["technical_alert_id"]}, {"$set": {"status": "Resolved"}})
    else:
        await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": {"status": "Accepted", "stage": "Repair Started"}})
        await push_notification(target_username=wo.get("assigned_technician"), title="Work Order Reopened",
                                 message=f"{wo['title']} reopened: {body.comment or 'Needs more work'}", link="/maintenance/work-orders")
    await log_activity(user["username"], user["role"], f"Reviewed work order ({body.decision})", {"work_order_id": wo_id, "comment": body.comment})
    return {"message": f"Work order {'closed' if body.decision == 'approve' else 'reopened'}"}


# ---------------------------------------------------------------------------
# Machine Diagnostics
# ---------------------------------------------------------------------------
DIAGNOSTIC_CHECKS = ["Motor RPM", "Blending Torque", "Valve Response Time", "Temperature Sensor", "Door Sensor", "Touchscreen Response", "Power Supply Voltage"]


@router.get("/diagnostics")
async def list_diagnostics(machine_id: Optional[str] = None, work_order_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if machine_id:
        query["machine_id"] = machine_id
    if work_order_id:
        query["work_order_id"] = work_order_id
    items = await db.machine_diagnostics.find(query).sort("created_at", -1).to_list(200)
    return serialize_list(items)


@router.post("/diagnostics/run")
async def run_diagnostics(body: dict, user: dict = Depends(require_roles(*ANY_TECH))):
    machine_id = body.get("machine_id")
    work_order_id = body.get("work_order_id")
    checks = []
    for c in DIAGNOSTIC_CHECKS:
        passed = RNG.random() > 0.2
        checks.append({"check": c, "result": "Pass" if passed else "Fail", "value": round(RNG.uniform(10, 100), 1)})
    doc = {
        "id": new_id(), "machine_id": machine_id, "machine_label": machine_label(machine_id), "work_order_id": work_order_id,
        "checks": checks, "overall_result": "Pass" if all(c["result"] == "Pass" for c in checks) else "Attention Needed",
        "run_by": user["username"], "created_at": now_iso(),
    }
    await db.machine_diagnostics.insert_one(doc)
    if work_order_id:
        await db.maintenance_work_orders.update_one({"id": work_order_id}, {"$push": {"history": {"stage": "Diagnostics Completed", "at": now_iso(), "by": user["username"]}}})
    return serialize(doc)


# ---------------------------------------------------------------------------
# Preventive Maintenance
# ---------------------------------------------------------------------------
@router.get("/preventive")
async def list_pm(user: dict = Depends(get_current_user)):
    items = await db.preventive_maintenance_schedules.find().sort("next_due_date", 1).to_list(200)
    return serialize_list(items)


class PMCreateBody(BaseModel):
    machine_id: str
    frequency_days: int = 90
    next_due_date: str
    checklist: List[str] = ["Motor Lubrication", "Sensor Calibration", "Belt Tension Check", "Software Update Check"]


@router.post("/preventive")
async def create_pm(body: PMCreateBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    doc = {
        "id": new_id(), "machine_id": body.machine_id, "machine_label": machine_label(body.machine_id),
        "checklist": body.checklist, "frequency_days": body.frequency_days, "next_due_date": body.next_due_date,
        "last_completed_date": None, "status": "Scheduled",
    }
    await db.preventive_maintenance_schedules.insert_one(doc)
    return serialize(doc)


@router.post("/preventive/{pm_id}/complete")
async def complete_pm(pm_id: str, user: dict = Depends(require_roles(*ANY_TECH))):
    pm = await db.preventive_maintenance_schedules.find_one({"id": pm_id})
    if not pm:
        raise HTTPException(status_code=404, detail="PM schedule not found")
    from datetime import datetime, timezone, timedelta
    next_due = (datetime.now(timezone.utc) + timedelta(days=pm["frequency_days"])).isoformat()
    await db.preventive_maintenance_schedules.update_one({"id": pm_id}, {"$set": {
        "last_completed_date": now_iso(), "next_due_date": next_due, "status": "Scheduled",
    }})
    await log_activity(user["username"], user["role"], "Completed preventive maintenance", {"pm_id": pm_id, "machine_id": pm["machine_id"]})
    return {"message": "Preventive maintenance marked complete"}


# ---------------------------------------------------------------------------
# Spare Parts Requests / Inventory / Approvals
# ---------------------------------------------------------------------------
class SparePartRequestBody(BaseModel):
    work_order_id: Optional[str] = None
    machine_id: str
    part_name: str
    quantity: int = 1
    reason: str


@router.get("/spare-parts-requests")
async def list_spare_part_requests(technician: Optional[str] = None, status: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if technician:
        query["technician"] = technician
    if status:
        query["status"] = status
    items = await db.spare_parts_requests.find(query).sort("requested_at", -1).to_list(200)
    return serialize_list(items)


@router.post("/spare-parts-requests")
async def create_spare_part_request(body: SparePartRequestBody, user: dict = Depends(require_roles(*ANY_TECH))):
    doc = {
        "id": new_id(), "work_order_id": body.work_order_id, "machine_id": body.machine_id,
        "machine_label": machine_label(body.machine_id), "technician": user["username"], "part_name": body.part_name,
        "quantity": body.quantity, "reason": body.reason, "status": "Pending Approval", "requested_at": now_iso(),
    }
    await db.spare_parts_requests.insert_one(doc)
    if body.work_order_id:
        await db.maintenance_work_orders.update_one({"id": body.work_order_id}, {"$push": {"history": {"stage": "Spare Part Requested", "at": now_iso(), "by": user["username"]}}})
    await push_notification(target_role="maintenance_supervisor", title="Spare Part Request",
                             message=f"{user['username']} requested {body.quantity}x {body.part_name}", link="/maintenance-supervisor/spare-parts-approvals")
    return serialize(doc)


@router.get("/spare-parts-approvals")
async def spare_parts_approvals(user: dict = Depends(get_current_user)):
    items = await db.spare_parts_requests.find({"status": "Pending Approval"}).sort("requested_at", -1).to_list(200)
    return serialize_list(items)


@router.post("/spare-parts-approvals/{req_id}/decision")
async def decide_spare_part_request(req_id: str, body: dict, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    req = await db.spare_parts_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    decision = body.get("decision")
    if decision == "approve":
        part = await db.spare_parts_inventory.find_one({"name": req["part_name"]})
        if part:
            await db.spare_parts_inventory.update_one({"id": part["id"]}, {"$inc": {"stock": -req["quantity"]}})
        await db.spare_parts_requests.update_one({"id": req_id}, {"$set": {"status": "Approved"}})
    else:
        await db.spare_parts_requests.update_one({"id": req_id}, {"$set": {"status": "Rejected"}})
    await push_notification(target_username=req["technician"], title=f"Spare Part Request {decision.title()}d",
                             message=f"{req['part_name']} request {decision}d", link="/maintenance/spare-parts-request")
    await log_activity(user["username"], user["role"], f"Spare part request {decision}d", {"request_id": req_id})
    return {"message": f"Request {decision}d"}


@router.get("/spare-parts-inventory")
async def spare_parts_inventory(user: dict = Depends(get_current_user)):
    items = await db.spare_parts_inventory.find().sort("name", 1).to_list(200)
    return serialize_list(items)


@router.post("/spare-parts-inventory/{part_id}/adjust")
async def adjust_inventory(part_id: str, body: dict, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    delta = body.get("delta", 0)
    await db.spare_parts_inventory.update_one({"id": part_id}, {"$inc": {"stock": delta}})
    return {"message": "Stock adjusted"}


# ---------------------------------------------------------------------------
# Machine Health / Technician Workload
# ---------------------------------------------------------------------------
@router.get("/health")
async def machine_health(user: dict = Depends(get_current_user)):
    items = await db.machine_health_logs.find().to_list(200)
    return serialize_list(items)


@router.get("/workload")
async def technician_workload(user: dict = Depends(get_current_user)):
    technicians = await db.users.find({"role": "maintenance_technician"}).to_list(50)
    out = []
    for t in technicians:
        active = await db.maintenance_work_orders.count_documents({"assigned_technician": t["username"], "status": {"$nin": ["Closed"]}})
        closed = await db.maintenance_work_orders.count_documents({"assigned_technician": t["username"], "status": "Closed"})
        out.append({"technician": t["username"], "name": t["name"], "active_work_orders": active, "closed_work_orders": closed})
    return out


# ---------------------------------------------------------------------------
# Escalations
# ---------------------------------------------------------------------------
@router.get("/escalations")
async def list_escalations(user: dict = Depends(get_current_user)):
    items = await db.escalations.find().sort("created_at", -1).to_list(200)
    return serialize_list(items)


class EscalationBody(BaseModel):
    work_order_id: Optional[str] = None
    machine_id: str
    reason: str


@router.post("/escalations")
async def create_escalation(body: EscalationBody, user: dict = Depends(get_current_user)):
    doc = {
        "id": new_id(), "work_order_id": body.work_order_id, "machine_id": body.machine_id,
        "machine_label": machine_label(body.machine_id), "raised_by": user["username"], "reason": body.reason,
        "status": "Open", "created_at": now_iso(),
    }
    await db.escalations.insert_one(doc)
    await push_notification(target_role="maintenance_supervisor", title="Escalation Raised",
                             message=body.reason, link="/maintenance-supervisor/escalations")
    return serialize(doc)


@router.post("/escalations/{esc_id}/resolve")
async def resolve_escalation(esc_id: str, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    await db.escalations.update_one({"id": esc_id}, {"$set": {"status": "Resolved"}})
    return {"message": "Escalation resolved"}


@router.get("/notifications")
async def maintenance_notifications(user: dict = Depends(get_current_user)):
    items = await db.notifications.find({"$or": [
        {"target_role": user["role"]}, {"target_username": user["username"]},
    ]}).sort("created_at", -1).to_list(200)
    return serialize_list(items)


# ---------------------------------------------------------------------------
# Door / Panel Access (Technician)
# ---------------------------------------------------------------------------
PANELS = ["Front Panel", "Side Panel", "Electronics Bay", "Right Door", "Left Door", "Back Door"]


@router.get("/panel-access")
async def panel_access_logs(machine_id: str, user: dict = Depends(get_current_user)):
    logs = await db.activity_logs.find({"action": "Panel Access", "details.machine_id": machine_id}).sort("created_at", -1).to_list(50)
    return {"panels": PANELS, "logs": serialize_list(logs)}


@router.post("/panel-access")
async def panel_access_action(body: dict, user: dict = Depends(require_roles(*ANY_TECH))):
    await log_activity(user["username"], user["role"], "Panel Access", {
        "machine_id": body.get("machine_id"), "panel": body.get("panel"), "action": body.get("action"),
    })
    return {"message": f"{body.get('panel')}: {body.get('action')} logged"}
