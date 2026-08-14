"""Maintenance Supervisor endpoints: technical alerts, work orders, technician assignment,
PM planning, calibration monitoring, workload, spare parts, escalations, supervisor review."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from database import db, serialize, serialize_list
from auth_utils import get_current_user, require_roles, new_id, now_iso, ANY_MAINT_SUPERVISOR
from seed_constants import machine_label
from utils import push_notification
from maint_constants import ALERT_TYPE_MASTER, PM_CHECKLIST, FREQUENCY_DAYS
from maint_core import (
    next_seq, log_maint, notify_technician, notify_supervisor, recalc_health, recalc_all_health,
    refresh_pm_statuses, write_service_history, technician_workload, parse_iso, utcnow, iso_in,
    next_due_from,
)

router = APIRouter(prefix="/api/maintenance-sup", tags=["maintenance-supervisor"])

ACTIVE_STATUSES = ["Assigned", "Accepted", "In Transit", "Reached Machine", "Diagnosis Started",
                   "Diagnosis Completed", "Repair In Progress", "Waiting for Parts", "Testing",
                   "Pending Supervisor Review"]
IN_PROGRESS_STATUSES = ["Accepted", "In Transit", "Reached Machine", "Diagnosis Started",
                        "Diagnosis Completed", "Repair In Progress", "Waiting for Parts", "Testing"]


async def _pick_technician() -> Optional[str]:
    techs = await db.users.find({"role": "maintenance_technician"}).sort("username", 1).to_list(50)
    best, best_load = None, None
    for t in techs:
        load = await technician_workload(t["username"])
        if best_load is None or load["active_work_orders"] < best_load:
            best, best_load = t["username"], load["active_work_orders"]
    return best


async def _set_machine_status(machine_id: str, status: str):
    machine = await db.machines.find_one({"id": machine_id})
    if not machine or machine.get("status") == status:
        return
    update = {"status": status}
    if machine.get("status") in ("Running", "Warning") and status in ("Under Maintenance", "Down"):
        update["pre_maintenance_status"] = machine.get("status")
    await db.machines.update_one({"id": machine_id}, {"$set": update})


async def _create_work_order(user: dict, machine_id: str, work_type: str, issue_type: str,
                              component: Optional[str], error_code: Optional[str], description: Optional[str],
                              priority: str, technician: Optional[str], start_at: Optional[str],
                              due_at: Optional[str], supervisor_comment: Optional[str],
                              alert: Optional[dict] = None, auto_assign: bool = True):
    if technician:
        tech_doc = await db.users.find_one({"username": technician, "role": "maintenance_technician"})
        if not tech_doc:
            raise HTTPException(status_code=400, detail="Selected technician not found")
    elif auto_assign:
        technician = await _pick_technician()

    wo_ref = await next_seq("WO")
    wo_id = new_id()
    history = []
    if alert:
        history.append({"stage": "Technical Alert Created", "at": alert.get("created_at"), "by": "system"})
    history.append({"stage": "Work Order Created", "at": now_iso(), "by": user["username"]})
    if technician:
        history.append({"stage": "Technician Assigned", "at": now_iso(), "by": user["username"], "note": technician})

    doc = {
        "id": wo_id, "wo_id": wo_ref, "machine_id": machine_id, "machine_label": machine_label(machine_id),
        "work_type": work_type, "issue_type": issue_type, "component": component, "error_code": error_code,
        "description": description, "priority": priority, "assigned_technician": technician,
        "assigned_by": user["username"], "assigned_at": now_iso() if technician else None,
        "start_at": start_at or now_iso(), "due_at": due_at or iso_in(hours=8),
        "status": "Assigned" if technician else "Assigned", "supervisor_comment": supervisor_comment,
        "technician_comment": None, "flagged": False, "flag": None, "qr_verified": False,
        "technical_alert_id": alert["id"] if alert else None,
        "technical_alert_ref": alert.get("alert_id") if alert else None,
        "parts_used": [], "repair": None, "review": None,
        "created_by": user["username"], "created_at": now_iso(), "updated_at": now_iso(),
        "closed_at": None, "history": history,
    }
    await db.maintenance_work_orders.insert_one(doc)
    if alert:
        await db.technical_alerts.update_one({"id": alert["id"]}, {"$set": {
            "status": "Work Order Created", "work_order_id": wo_id, "work_order_ref": wo_ref,
        }})
    if technician:
        await notify_technician(technician, "New Work Order Assigned",
                                f"{wo_ref} \u00b7 {issue_type} on {machine_label(machine_id)} ({priority})")
    if priority in ("High", "Critical"):
        await _set_machine_status(machine_id, "Under Maintenance")
    if issue_type == "Machine Down" or (alert and alert.get("alert_type") == "Machine Down"):
        await _set_machine_status(machine_id, "Down")
    await log_maint(user, "Created work order", machine_id, wo_id, {"wo_id": wo_ref, "technician": technician})
    await recalc_health(machine_id)
    return doc


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@router.get("/dashboard")
async def dashboard(user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    await refresh_pm_statuses()
    await recalc_all_health()
    health = await db.machine_health_logs.find().to_list(100)
    wos = await db.maintenance_work_orders.find().to_list(1000)
    today = utcnow().date().isoformat()
    pm_due = await db.preventive_maintenance_schedules.count_documents({"status": "Due"})
    pm_overdue = await db.preventive_maintenance_schedules.count_documents({"status": "Overdue"})
    cal_failed = await db.calibration_records.count_documents({"result": "FAIL", "recalibrated": False})
    cal_due = await db.calibration_records.count_documents({"recalibration_required": True, "recalibrated": False})
    critical_alerts = await db.technical_alerts.count_documents({"severity": "Critical", "status": {"$nin": ["Resolved", "Closed"]}})
    return {
        "total_machines": len(health),
        "healthy_machines": len([h for h in health if h["health_status"] == "Healthy"]),
        "warning_machines": len([h for h in health if h["health_status"] == "Warning"]),
        "critical_machines": len([h for h in health if h["health_status"] == "Critical"]),
        "machines_down": len([h for h in health if h["health_status"] == "Down"]),
        "machines_under_maintenance": len([h for h in health if h["health_status"] == "Under Maintenance"]),
        "open_work_orders": len([w for w in wos if w["status"] in ACTIVE_STATUSES]),
        "pm_due": pm_due, "pm_overdue": pm_overdue,
        "calibration_due": cal_due, "calibration_failed": cal_failed,
        "waiting_for_parts": len([w for w in wos if w["status"] == "Waiting for Parts"]),
        "technician_tasks_in_progress": len([w for w in wos if w["status"] in IN_PROGRESS_STATUSES]),
        "completed_repairs_today": len([w for w in wos if (w.get("closed_at") or "").startswith(today)]),
        "pending_supervisor_review": len([w for w in wos if w["status"] == "Pending Supervisor Review"]),
        "critical_technical_alerts": critical_alerts,
    }


# ---------------------------------------------------------------------------
# Technical alerts
# ---------------------------------------------------------------------------
@router.get("/technical-alerts")
async def technical_alerts(status: Optional[str] = None, severity: Optional[str] = None,
                            alert_type: Optional[str] = None, machine_id: Optional[str] = None,
                            user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    q = {}
    if status == "Open":
        q["status"] = {"$nin": ["Resolved", "Closed"]}
    elif status:
        q["status"] = status
    for field, value in [("severity", severity), ("alert_type", alert_type), ("machine_id", machine_id)]:
        if value:
            q[field] = value
    items = await db.technical_alerts.find(q).sort("created_at", -1).to_list(500)
    return serialize_list(items)


class AlertWorkOrderBody(BaseModel):
    work_type: str = "Breakdown"
    priority: Optional[str] = None
    technician: Optional[str] = None
    description: Optional[str] = None
    start_at: Optional[str] = None
    due_at: Optional[str] = None
    supervisor_comment: Optional[str] = None


@router.post("/technical-alerts/{alert_id}/create-work-order")
async def create_wo_from_alert(alert_id: str, body: AlertWorkOrderBody,
                               user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    alert = await db.technical_alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Technical alert not found")
    if alert.get("work_order_id"):
        raise HTTPException(status_code=400, detail="A work order already exists for this alert")
    priority = body.priority or {"Critical": "Critical", "High": "High", "Medium": "Medium", "Low": "Low"}.get(alert.get("severity"), "Medium")
    wo = await _create_work_order(
        user, alert["machine_id"], body.work_type, alert["alert_type"], alert.get("component"),
        alert.get("error_code"), body.description or alert.get("detail") or alert.get("suggested_action"),
        priority, body.technician, body.start_at, body.due_at, body.supervisor_comment, alert=alert,
    )
    return {"message": f"Work order {wo['wo_id']} created", "work_order": serialize(wo)}


class EmailStaffBody(BaseModel):
    note: Optional[str] = None


@router.post("/technical-alerts/{alert_id}/email-staff")
async def email_staff(alert_id: str, body: EmailStaffBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    alert = await db.technical_alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Technical alert not found")
    await push_notification(target_role="maintenance_technician", title="Technical Alert Escalation Email",
                             message=f"{alert['alert_type']} on {alert['machine_label']} ({alert['error_code']}). {body.note or ''}".strip(),
                             link="/technician/work-orders")
    await db.technical_alerts.update_one({"id": alert_id}, {"$set": {"emailed_at": now_iso()}})
    await log_maint(user, "Emailed staff about technical alert", alert["machine_id"], alert.get("work_order_id"),
                    {"alert_id": alert.get("alert_id")})
    return {"message": "Email sent to maintenance staff (simulated)."}


class EscalateBody(BaseModel):
    reason: str
    priority: str = "High"
    comment: Optional[str] = None


@router.post("/technical-alerts/{alert_id}/escalate")
async def escalate_alert(alert_id: str, body: EscalateBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    alert = await db.technical_alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Technical alert not found")
    esc_ref = await next_seq("ESC")
    await db.escalations.insert_one({
        "id": new_id(), "esc_id": esc_ref, "work_order_id": alert.get("work_order_id"),
        "work_order_ref": alert.get("work_order_ref"), "machine_id": alert["machine_id"],
        "machine_label": alert["machine_label"], "issue": alert["alert_type"],
        "technician": None, "reason": body.reason, "comment": body.comment, "priority": body.priority,
        "raised_by": user["username"], "created_at": now_iso(), "status": "Open", "comments": [],
    })
    await db.technical_alerts.update_one({"id": alert_id}, {"$set": {"status": "Escalated"}})
    await log_maint(user, "Escalated technical alert", alert["machine_id"], alert.get("work_order_id"), {"escalation": esc_ref})
    return {"message": f"Escalation {esc_ref} raised"}


class AckBody(BaseModel):
    resolution_note: Optional[str] = None


@router.post("/technical-alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, body: AckBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    alert = await db.technical_alerts.find_one({"id": alert_id})
    if not alert:
        raise HTTPException(status_code=404, detail="Technical alert not found")
    critical = alert.get("severity") == "Critical" or alert.get("alert_type") == "Machine Down"
    if critical and not alert.get("work_order_id") and not (body.resolution_note or "").strip():
        raise HTTPException(status_code=400,
                            detail="Critical / Machine Down alerts cannot be closed without a work order or a documented resolution.")
    await db.technical_alerts.update_one({"id": alert_id}, {"$set": {
        "status": "Resolved" if body.resolution_note else "Acknowledged",
        "acknowledged_by": user["username"], "resolution_note": body.resolution_note,
        "acknowledged_at": now_iso(),
    }})
    await recalc_health(alert["machine_id"])
    await log_maint(user, "Acknowledged technical alert", alert["machine_id"], alert.get("work_order_id"),
                    {"alert_id": alert.get("alert_id")})
    return {"message": "Technical alert updated"}


# ---------------------------------------------------------------------------
# Work orders
# ---------------------------------------------------------------------------
class WorkOrderBody(BaseModel):
    machine_id: str
    work_type: str = "Breakdown"
    issue_type: str
    component: Optional[str] = None
    error_code: Optional[str] = None
    description: Optional[str] = None
    priority: str = "Medium"
    technician: Optional[str] = None
    start_at: Optional[str] = None
    due_at: Optional[str] = None
    supervisor_comment: Optional[str] = None


@router.post("/work-orders")
async def create_work_order(body: WorkOrderBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    master = ALERT_TYPE_MASTER.get(body.issue_type)
    wo = await _create_work_order(
        user, body.machine_id, body.work_type, body.issue_type,
        body.component or (master[0] if master else None), body.error_code or (master[1] if master else None),
        body.description, body.priority, body.technician, body.start_at, body.due_at, body.supervisor_comment,
    )
    return {"message": f"Work order {wo['wo_id']} created", "work_order": serialize(wo)}


class AssignBody(BaseModel):
    technician: Optional[str] = None
    comment: Optional[str] = None


@router.post("/work-orders/{wo_id}/assign")
async def assign_work_order(wo_id: str, body: AssignBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    technician = body.technician or await _pick_technician()
    if not technician:
        raise HTTPException(status_code=400, detail="No maintenance technician available")
    reassigned = bool(wo.get("assigned_technician")) and wo["assigned_technician"] != technician
    await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": {
        "assigned_technician": technician, "assigned_by": user["username"], "assigned_at": now_iso(),
        "status": "Assigned", "qr_verified": False, "updated_at": now_iso(),
        "supervisor_comment": body.comment or wo.get("supervisor_comment"),
    }, "$push": {"history": {"stage": "Technician Assigned", "at": now_iso(), "by": user["username"], "note": technician}}})
    await notify_technician(technician, "Work Order Reassigned" if reassigned else "New Work Order Assigned",
                            f"{wo.get('wo_id')} \u00b7 {wo.get('issue_type')} on {wo['machine_label']}")
    await log_maint(user, "Reassigned work order" if reassigned else "Assigned work order", wo["machine_id"], wo_id,
                    {"technician": technician})
    return {"message": f"Work order assigned to {technician}", "technician": technician}


class PriorityBody(BaseModel):
    priority: str


@router.post("/work-orders/{wo_id}/priority")
async def change_priority(wo_id: str, body: PriorityBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": {"priority": body.priority, "updated_at": now_iso()},
                                                                 "$push": {"history": {"stage": "Priority Changed", "at": now_iso(), "by": user["username"], "note": body.priority}}})
    await notify_technician(wo.get("assigned_technician"), "Work Order Priority Changed",
                            f"{wo.get('wo_id')} priority set to {body.priority}")
    await log_maint(user, "Changed work order priority", wo["machine_id"], wo_id, {"priority": body.priority})
    return {"message": f"Priority set to {body.priority}"}


class DueBody(BaseModel):
    due_at: str


@router.post("/work-orders/{wo_id}/due")
async def change_due(wo_id: str, body: DueBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": {"due_at": body.due_at, "updated_at": now_iso()},
                                                                 "$push": {"history": {"stage": "Due Time Changed", "at": now_iso(), "by": user["username"], "note": body.due_at}}})
    return {"message": "Due date/time updated"}


class SupComment(BaseModel):
    comment: str


@router.post("/work-orders/{wo_id}/comment")
async def supervisor_comment(wo_id: str, body: SupComment, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": {"supervisor_comment": body.comment, "updated_at": now_iso()},
                                                                 "$push": {"history": {"stage": "Supervisor Comment", "at": now_iso(), "by": user["username"], "note": body.comment}}})
    await notify_technician(wo.get("assigned_technician"), "Supervisor Comment", f"{wo.get('wo_id')}: {body.comment}")
    return {"message": "Comment added"}


@router.post("/work-orders/{wo_id}/escalate")
async def escalate_work_order(wo_id: str, body: EscalateBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    esc_ref = await next_seq("ESC")
    await db.escalations.insert_one({
        "id": new_id(), "esc_id": esc_ref, "work_order_id": wo_id, "work_order_ref": wo.get("wo_id"),
        "machine_id": wo["machine_id"], "machine_label": wo["machine_label"],
        "issue": wo.get("issue_type"), "technician": wo.get("assigned_technician"), "reason": body.reason,
        "comment": body.comment, "priority": body.priority, "raised_by": user["username"],
        "created_at": now_iso(), "status": "Open", "comments": [],
    })
    await log_maint(user, "Escalated work order", wo["machine_id"], wo_id, {"escalation": esc_ref})
    return {"message": f"Escalation {esc_ref} raised"}


class ReviewBody(BaseModel):
    decision: str  # approve | return | reopen
    comment: Optional[str] = None


@router.post("/work-orders/{wo_id}/review")
async def review_work_order(wo_id: str, body: ReviewBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if body.decision == "approve":
        if wo["status"] != "Pending Supervisor Review":
            raise HTTPException(status_code=400, detail="Only work orders pending supervisor review can be approved and closed.")
        closed_at = now_iso()
        await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": {
            "status": "Closed", "completed_at": closed_at, "closed_at": closed_at, "updated_at": closed_at,
            "review": {"decision": "Approved and Closed", "by": user["username"], "at": closed_at, "comment": body.comment},
        }, "$push": {"history": {"$each": [
            {"stage": "Supervisor Reviewed", "at": closed_at, "by": user["username"], "note": body.comment},
            {"stage": "Closed", "at": closed_at, "by": user["username"]},
        ]}}})
        wo["closed_at"] = closed_at
        await write_service_history(wo, f"Approved by {user['username']}", "Closed")
        if wo.get("technical_alert_id"):
            await db.technical_alerts.update_one({"id": wo["technical_alert_id"]}, {"$set": {
                "status": "Resolved", "resolution_note": body.comment or "Resolved via work order", "acknowledged_by": user["username"],
            }})
        await db.calibration_records.update_many({"work_order_id": wo_id, "result": "FAIL"}, {"$set": {"recalibrated": True}})
        # Machine status: only recover when no unresolved critical faults remain
        remaining = await db.technical_alerts.count_documents({
            "machine_id": wo["machine_id"], "status": {"$nin": ["Resolved", "Closed"]},
            "severity": {"$in": ["Critical", "High"]},
        })
        machine = await db.machines.find_one({"id": wo["machine_id"]})
        if remaining == 0:
            await db.machines.update_one({"id": wo["machine_id"]}, {"$set": {
                "status": machine.get("pre_maintenance_status") or "Running",
            }})
        else:
            await db.machines.update_one({"id": wo["machine_id"]}, {"$set": {"status": "Warning"}})
        await notify_technician(wo.get("assigned_technician"), "Work Order Closed",
                                 f"{wo.get('wo_id')} approved and closed by supervisor")
        message = "Work order approved and closed"
    elif body.decision in ("return", "reopen"):
        if not (body.comment or "").strip():
            raise HTTPException(status_code=400, detail="A comment is mandatory when returning or reopening a work order.")
        new_status = "Repair In Progress" if body.decision == "reopen" else "Testing"
        await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": {
            "status": new_status, "updated_at": now_iso(),
            "review": {"decision": "Returned to Technician" if body.decision == "return" else "Repair Reopened",
                        "by": user["username"], "at": now_iso(), "comment": body.comment},
        }, "$push": {"history": {"stage": "Supervisor Reviewed", "at": now_iso(), "by": user["username"], "note": body.comment}}})
        await notify_technician(wo.get("assigned_technician"),
                                 "Work Order Returned" if body.decision == "return" else "Repair Reopened",
                                 f"{wo.get('wo_id')}: {body.comment}")
        message = "Work order returned to technician" if body.decision == "return" else "Repair reopened"
    else:
        raise HTTPException(status_code=400, detail="Unknown review decision")
    await log_maint(user, f"Supervisor review ({body.decision})", wo["machine_id"], wo_id, {"comment": body.comment})
    await recalc_health(wo["machine_id"])
    return {"message": message}


@router.get("/live-progress")
async def live_progress(machine_id: Optional[str] = None, technician: Optional[str] = None,
                         status: Optional[str] = None, flagged: Optional[bool] = None,
                         user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    q = {"status": {"$in": ACTIVE_STATUSES}}
    if status:
        q["status"] = status
    if machine_id:
        q["machine_id"] = machine_id
    if technician:
        q["assigned_technician"] = technician
    if flagged:
        q["flagged"] = True
    items = await db.maintenance_work_orders.find(q).sort("updated_at", -1).to_list(300)
    return serialize_list(items)


# ---------------------------------------------------------------------------
# Preventive maintenance planner
# ---------------------------------------------------------------------------
@router.get("/pm")
async def list_pm(machine_id: Optional[str] = None, status: Optional[str] = None,
                   user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    await refresh_pm_statuses()
    q = {}
    if machine_id:
        q["machine_id"] = machine_id
    if status:
        q["status"] = status
    items = await db.preventive_maintenance_schedules.find(q).sort("due_at", 1).to_list(300)
    return serialize_list(items)


class PMBody(BaseModel):
    machine_id: str
    pm_type: str = "Routine PM"
    frequency: str = "Quarterly"
    scheduled_at: Optional[str] = None
    due_at: Optional[str] = None
    technician: Optional[str] = None
    priority: str = "Medium"
    checklist_template: str = "Standard 31-Point PM Checklist"
    comment: Optional[str] = None


@router.post("/pm")
async def create_pm(body: PMBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    technician = body.technician or await _pick_technician()
    pm_ref = await next_seq("PM")
    scheduled_at = body.scheduled_at or now_iso()
    due_at = body.due_at or next_due_from(body.frequency)
    steps = [{"step": s, "requires_photo": p, "status": "Not Started", "comment": None,
              "before_photo": None, "after_photo": None, "completed_at": None} for s, p in PM_CHECKLIST]
    wo = await _create_work_order(
        user, body.machine_id, "Preventive Maintenance", f"{body.pm_type} ({body.frequency})", "Other",
        "E-PM-23", body.comment or f"{body.checklist_template} scheduled by supervisor", body.priority,
        technician, scheduled_at, due_at, body.comment, auto_assign=True,
    )
    doc = {
        "id": new_id(), "pm_id": pm_ref, "machine_id": body.machine_id, "machine_label": machine_label(body.machine_id),
        "pm_type": body.pm_type, "frequency": body.frequency, "scheduled_at": scheduled_at, "due_at": due_at,
        "technician": technician, "priority": body.priority, "checklist_template": body.checklist_template,
        "comment": body.comment, "status": "Scheduled", "steps": steps, "work_order_id": wo["id"],
        "work_order_ref": wo["wo_id"], "created_by": user["username"], "created_at": now_iso(),
        "last_completed_at": None, "next_due_at": None,
    }
    await db.preventive_maintenance_schedules.insert_one(doc)
    await refresh_pm_statuses()
    await notify_technician(technician, "Preventive Maintenance Scheduled",
                             f"{pm_ref} \u00b7 {body.pm_type} on {machine_label(body.machine_id)}",
                             "/technician/preventive-maintenance")
    await log_maint(user, "Scheduled preventive maintenance", body.machine_id, wo["id"], {"pm_id": pm_ref})
    return {"message": f"Preventive maintenance {pm_ref} scheduled", "pm": serialize(doc)}


# ---------------------------------------------------------------------------
# Calibration monitoring
# ---------------------------------------------------------------------------
@router.get("/calibration-monitoring")
async def calibration_monitoring(machine_id: Optional[str] = None, result: Optional[str] = None,
                                  status: Optional[str] = None, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    q = {}
    if machine_id:
        q["machine_id"] = machine_id
    if result:
        q["result"] = result
    items = await db.calibration_records.find(q).sort("created_at", -1).to_list(500)
    out = []
    for c in serialize_list(items):
        due = parse_iso(c.get("next_due"))
        if c.get("result") == "FAIL" and not c.get("recalibrated"):
            state = "Recalibration Required"
        elif due and due < utcnow():
            state = "Overdue"
        elif due and (due - utcnow()).days <= 3:
            state = "Due"
        else:
            state = "Passed" if c.get("result") == "PASS" else "Failed"
        c["monitor_status"] = state
        if not status or status == state:
            out.append(c)
    return out


class RecalBody(BaseModel):
    technician: Optional[str] = None
    priority: str = "Medium"
    comment: Optional[str] = None


@router.post("/calibration-monitoring/{record_id}/assign-recalibration")
async def assign_recalibration(record_id: str, body: RecalBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    rec = await db.calibration_records.find_one({"id": record_id})
    if not rec:
        raise HTTPException(status_code=404, detail="Calibration record not found")
    wo = await _create_work_order(
        user, rec["machine_id"], "Calibration",
        f"Recalibration \u2013 {rec.get('item') or rec.get('slot_id') or rec['calibration_type']}",
        "Other", "E-CAL-22",
        f"Recalibrate {rec.get('slot_id') or ''} {rec.get('bin_id') or ''} ({rec['calibration_type']}). Previous variance {rec.get('variance_pct')}%.",
        body.priority, body.technician, None, None, body.comment,
    )
    await db.calibration_records.update_one({"id": record_id}, {"$set": {
        "recalibration_work_order_id": wo["id"], "recalibration_work_order_ref": wo["wo_id"],
        "status": "Recalibration Required",
    }})
    return {"message": f"Recalibration work order {wo['wo_id']} created", "work_order": serialize(wo)}


# ---------------------------------------------------------------------------
# Technician workload
# ---------------------------------------------------------------------------
@router.get("/workload")
async def workload(user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    techs = await db.users.find({"role": "maintenance_technician"}).sort("username", 1).to_list(50)
    out = []
    for t in techs:
        load = await technician_workload(t["username"])
        machines = t.get("assigned_machines") or []
        out.append({
            "technician": t["username"], "name": t.get("name"),
            "assigned_machines": [machine_label(m) for m in machines],
            "assigned_machine_count": len(machines), **load,
        })
    return out


# ---------------------------------------------------------------------------
# Spare parts
# ---------------------------------------------------------------------------
@router.get("/spare-parts-inventory")
async def spare_parts_inventory(user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    items = await db.spare_parts_inventory.find().sort("part_name", 1).to_list(300)
    out = []
    for p in serialize_list(items):
        assigned = p.get("assigned_qty", 0)
        total = p.get("total_stock", 0)
        available = max(total - assigned, 0)
        p["available_stock"] = available
        p["reorder_status"] = "Reorder Now" if available <= p.get("min_stock", 0) else "OK"
        out.append(p)
    return out


class AdjustBody(BaseModel):
    delta: int
    comment: Optional[str] = None


@router.post("/spare-parts-inventory/{part_id}/adjust")
async def adjust_inventory(part_id: str, body: AdjustBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    part = await db.spare_parts_inventory.find_one({"id": part_id})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    await db.spare_parts_inventory.update_one({"id": part_id}, {"$inc": {"total_stock": body.delta}})
    await log_maint(user, "Adjusted spare part stock", None, None, {"part": part["part_name"], "delta": body.delta})
    return {"message": f"{part['part_name']} stock adjusted by {body.delta}"}


@router.get("/spare-parts-requests")
async def part_requests(status: Optional[str] = None, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    q = {}
    if status == "Pending":
        q["status"] = "Requested"
    elif status:
        q["status"] = status
    items = await db.spare_parts_requests.find(q).sort("requested_at", -1).to_list(300)
    return serialize_list(items)


class DecisionBody(BaseModel):
    decision: str  # approve | reject | issue
    comment: Optional[str] = None


@router.post("/spare-parts-requests/{req_id}/decision")
async def decide_request(req_id: str, body: DecisionBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    req = await db.spare_parts_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if body.decision == "approve":
        if req["status"] != "Requested":
            raise HTTPException(status_code=400, detail="Only requested items can be approved.")
        await db.spare_parts_requests.update_one({"id": req_id}, {"$set": {
            "status": "Approved", "supervisor_comment": body.comment, "decided_at": now_iso(), "decided_by": user["username"],
        }})
        await notify_technician(req["technician"], "Spare Part Approved",
                                 f"{req['quantity']}x {req['part_name']} approved for {req['machine_label']}",
                                 "/technician/spare-parts")
        message = "Request approved"
    elif body.decision == "reject":
        await db.spare_parts_requests.update_one({"id": req_id}, {"$set": {
            "status": "Rejected", "supervisor_comment": body.comment, "decided_at": now_iso(), "decided_by": user["username"],
        }})
        await notify_technician(req["technician"], "Spare Part Rejected",
                                 f"{req['part_name']} request rejected: {body.comment or 'No reason provided'}",
                                 "/technician/spare-parts")
        message = "Request rejected"
    elif body.decision == "issue":
        if req["status"] not in ("Approved", "Requested"):
            raise HTTPException(status_code=400, detail="Approve the request before issuing the part.")
        part = await db.spare_parts_inventory.find_one({"part_code": req["part_code"]})
        if part and (part.get("total_stock", 0) - part.get("assigned_qty", 0)) < req["quantity"]:
            raise HTTPException(status_code=400, detail="Not enough available stock in the central store.")
        await db.spare_parts_inventory.update_one({"part_code": req["part_code"]}, {"$inc": {"assigned_qty": req["quantity"]}})
        await db.spare_parts_requests.update_one({"id": req_id}, {"$set": {
            "status": "Issued", "issued_at": now_iso(), "issued_by": user["username"],
            "supervisor_comment": body.comment or req.get("supervisor_comment"),
        }})
        if req.get("work_order_id"):
            wo = await db.maintenance_work_orders.find_one({"id": req["work_order_id"]})
            if wo:
                await db.maintenance_work_orders.update_one({"id": wo["id"]}, {"$set": {"updated_at": now_iso()},
                    "$push": {"history": {"stage": "Part Issued", "at": now_iso(), "by": user["username"],
                                           "note": f"{req['quantity']}x {req['part_name']} issued"}}})
        await notify_technician(req["technician"], "Spare Part Issued",
                                 f"{req['quantity']}x {req['part_name']} issued \u2014 mark as received to add to your inventory.",
                                 "/technician/spare-parts")
        message = "Part issued to technician"
    else:
        raise HTTPException(status_code=400, detail="Unknown decision")
    await log_maint(user, f"Spare part request {body.decision}", req.get("machine_id"), req.get("work_order_id"),
                    {"part": req["part_name"], "req_id": req.get("req_id")})
    return {"message": message}


# ---------------------------------------------------------------------------
# Escalations
# ---------------------------------------------------------------------------
@router.get("/escalations")
async def escalations(status: Optional[str] = None, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    q = {"status": status} if status else {}
    items = await db.escalations.find(q).sort("created_at", -1).to_list(300)
    out = []
    for e in serialize_list(items):
        created = parse_iso(e.get("created_at"))
        e["age_hours"] = round((utcnow() - created).total_seconds() / 3600, 1) if created else 0
        out.append(e)
    return out


@router.post("/escalations/{esc_id}/comment")
async def escalation_comment(esc_id: str, body: SupComment, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    esc = await db.escalations.find_one({"id": esc_id})
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation not found")
    await db.escalations.update_one({"id": esc_id}, {"$push": {"comments": {
        "comment": body.comment, "by": user["username"], "at": now_iso(),
    }}})
    return {"message": "Comment added"}


@router.post("/escalations/{esc_id}/assign")
async def escalation_assign(esc_id: str, body: AssignBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    esc = await db.escalations.find_one({"id": esc_id})
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation not found")
    technician = body.technician or await _pick_technician()
    if esc.get("work_order_id"):
        wo = await db.maintenance_work_orders.find_one({"id": esc["work_order_id"]})
        if wo:
            await db.maintenance_work_orders.update_one({"id": wo["id"]}, {"$set": {
                "assigned_technician": technician, "status": "Assigned", "qr_verified": False, "updated_at": now_iso(),
            }, "$push": {"history": {"stage": "Technician Assigned", "at": now_iso(), "by": user["username"], "note": technician}}})
    await db.escalations.update_one({"id": esc_id}, {"$set": {"technician": technician, "status": "Assigned"}})
    await notify_technician(technician, "Escalation Assigned",
                             f"{esc.get('esc_id')} \u00b7 {esc.get('issue')} on {esc['machine_label']}")
    return {"message": f"Escalation assigned to {technician}"}


@router.post("/escalations/{esc_id}/email-staff")
async def escalation_email(esc_id: str, body: EmailStaffBody, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    esc = await db.escalations.find_one({"id": esc_id})
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation not found")
    await push_notification(target_role="maintenance_technician", title="Escalation Email",
                             message=f"{esc.get('esc_id')} \u00b7 {esc.get('reason')} on {esc['machine_label']}. {body.note or ''}".strip(),
                             link="/technician/work-orders")
    return {"message": "Email sent to maintenance staff (simulated)."}


@router.post("/escalations/{esc_id}/resolve")
async def escalation_resolve(esc_id: str, body: SupComment, user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    esc = await db.escalations.find_one({"id": esc_id})
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation not found")
    await db.escalations.update_one({"id": esc_id}, {"$set": {
        "status": "Resolved", "resolved_at": now_iso(), "resolved_by": user["username"], "resolution": body.comment,
    }})
    if esc.get("work_order_id"):
        await db.maintenance_work_orders.update_one({"id": esc["work_order_id"]}, {"$set": {"flagged": False, "flag": None}})
    await log_maint(user, "Resolved escalation", esc.get("machine_id"), esc.get("work_order_id"), {"esc_id": esc.get("esc_id")})
    return {"message": "Escalation resolved"}


@router.get("/review-queue")
async def review_queue(user: dict = Depends(require_roles(*ANY_MAINT_SUPERVISOR))):
    items = await db.maintenance_work_orders.find({"status": "Pending Supervisor Review"}).sort("submitted_at", -1).to_list(200)
    return serialize_list(items)
