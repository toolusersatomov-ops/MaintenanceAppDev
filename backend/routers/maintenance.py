"""Maintenance Technician + shared maintenance endpoints.
Reuses the shared master data (machines, slots, bins, ingredients, units, users)
from seed_constants / existing collections. Nothing here duplicates it.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from database import db, serialize, serialize_list
from auth_utils import get_current_user, require_roles, new_id, now_iso, ANY_TECH
from seed_constants import machine_label, INGREDIENT_NAME, INGREDIENT_UNIT
from utils import push_notification
from maint_constants import (
    WORK_TYPES, PRIORITIES, WO_STATUSES, WO_ACTIONS, TIMELINE_STAGES, FLAG_REASONS,
    ESCALATION_REASONS, ALERT_TYPES, ALERT_TYPE_MASTER, SEVERITIES, DIAGNOSTIC_CHECKS,
    DIAGNOSTIC_STATUSES, COMPONENT_CATEGORIES, INPUT_TESTS, OUTPUT_TESTS, CALIBRATION_TYPES,
    PM_CHECKLIST, PM_STEP_STATUSES, PM_TYPES, PM_FREQUENCIES, PANELS, REPLACEMENT_REASONS,
    PART_REQUEST_STATUSES, TOLERANCE_PCT, HEALTH_STATUSES, MAINTENANCE_REPORT_LIST,
)
from maint_core import (
    next_seq, log_maint, add_stage, notify_supervisor, notify_technician, recalc_health,
    refresh_pm_statuses, calc_calibration, create_technical_alert, parse_iso, utcnow,
    iso_in, next_due_from, technician_workload,
)

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])

ACTIVE_STATUSES = [s for s in WO_STATUSES if s not in ("Closed", "Completed")]


def machine_qr(machine_id: str) -> str:
    return f"MQR-{machine_id}"


async def _visible_machine_ids(user: dict) -> List[str]:
    if user["role"] == "maintenance_technician":
        assigned = user.get("assigned_machines") or []
        if assigned:
            return assigned
    machines = await db.machines.find().to_list(100)
    return [m["id"] for m in machines]


# ---------------------------------------------------------------------------
# Meta / master data for forms
# ---------------------------------------------------------------------------
@router.get("/meta")
async def meta(user: dict = Depends(get_current_user)):
    return {
        "work_types": WORK_TYPES, "priorities": PRIORITIES, "wo_statuses": WO_STATUSES,
        "wo_actions": list(WO_ACTIONS.keys()), "timeline_stages": TIMELINE_STAGES,
        "flag_reasons": FLAG_REASONS, "escalation_reasons": ESCALATION_REASONS,
        "alert_types": ALERT_TYPES, "severities": SEVERITIES,
        "alert_master": {k: {"component": v[0], "error_code": v[1], "severity": v[2], "suggested_action": v[3]}
                          for k, v in ALERT_TYPE_MASTER.items()},
        "diagnostic_checks": [{"component": c, "component_id": cid, "expected": exp, "error_code": ec}
                               for c, cid, exp, ec in DIAGNOSTIC_CHECKS],
        "diagnostic_statuses": DIAGNOSTIC_STATUSES, "component_categories": COMPONENT_CATEGORIES,
        "input_tests": INPUT_TESTS, "output_tests": [{"component": c, "command": cmd} for c, cmd in OUTPUT_TESTS],
        "calibration_types": CALIBRATION_TYPES, "tolerance_pct": TOLERANCE_PCT,
        "pm_checklist": [{"step": s, "requires_photo": p} for s, p in PM_CHECKLIST],
        "pm_step_statuses": PM_STEP_STATUSES, "pm_types": PM_TYPES, "pm_frequencies": PM_FREQUENCIES,
        "panels": PANELS, "replacement_reasons": REPLACEMENT_REASONS,
        "part_request_statuses": PART_REQUEST_STATUSES, "health_statuses": HEALTH_STATUSES,
        "reports": MAINTENANCE_REPORT_LIST,
    }


@router.get("/machines")
async def list_machines(user: dict = Depends(get_current_user)):
    ids = await _visible_machine_ids(user)
    await refresh_pm_statuses()
    out = []
    for mid in ids:
        health = await recalc_health(mid)
        if health:
            out.append(health)
    out.sort(key=lambda h: h["machine_id"])
    return out


@router.get("/machines/{machine_id}")
async def machine_detail(machine_id: str, user: dict = Depends(get_current_user)):
    health = await recalc_health(machine_id)
    if not health:
        raise HTTPException(status_code=404, detail="Machine not found")
    alerts = await db.technical_alerts.find({"machine_id": machine_id, "status": {"$nin": ["Resolved", "Closed"]}}).sort("created_at", -1).to_list(100)
    wos = await db.maintenance_work_orders.find({"machine_id": machine_id}).sort("created_at", -1).to_list(200)
    diags = await db.machine_diagnostics.find({"machine_id": machine_id}).sort("created_at", -1).to_list(20)
    pms = await db.preventive_maintenance_schedules.find({"machine_id": machine_id}).sort("due_at", 1).to_list(50)
    cals = await db.calibration_records.find({"machine_id": machine_id}).sort("created_at", -1).to_list(100)
    parts = await db.spare_parts_usage.find({"machine_id": machine_id}).sort("created_at", -1).to_list(100)
    history = await db.service_history.find({"machine_id": machine_id}).sort("date", -1).to_list(100)
    tests = await db.component_tests.find({"machine_id": machine_id}).sort("created_at", -1).to_list(100)

    component_health = {}
    if diags:
        for item in diags[0].get("items", []):
            component_health[item["component"]] = item.get("status", "Pass")
    for a in alerts:
        component_health[a.get("component") or "Other"] = "Fail"

    downtime = [{"work_order_ref": w.get("wo_id"), "issue": w.get("issue_type"), "started": w.get("created_at"),
                 "ended": w.get("closed_at"),
                 "minutes": int((((parse_iso(w.get("closed_at")) or utcnow()) - parse_iso(w["created_at"])).total_seconds()) // 60)}
                for w in wos if w.get("work_type") == "Breakdown"]

    return {
        "health": health,
        "component_health": [{"component": k, "status": v} for k, v in sorted(component_health.items())],
        "alerts": serialize_list(alerts), "work_orders": serialize_list(wos),
        "diagnostics": serialize_list(diags), "pm_history": serialize_list(pms),
        "calibration_history": serialize_list(cals), "parts_history": serialize_list(parts),
        "service_history": serialize_list(history), "component_tests": serialize_list(tests),
        "downtime_history": downtime,
    }


@router.get("/technicians")
async def list_technicians(user: dict = Depends(get_current_user)):
    items = await db.users.find({"role": "maintenance_technician"}).sort("username", 1).to_list(50)
    out = []
    for t in serialize_list(items):
        t.pop("password_hash", None)
        load = await technician_workload(t["username"])
        machines = t.get("assigned_machines") or []
        out.append({**t, **load, "assigned_machines": machines,
                     "assigned_machine_labels": [machine_label(m) for m in machines]})
    return out


@router.get("/notifications")
async def notifications(user: dict = Depends(get_current_user)):
    items = await db.notifications.find({"$or": [
        {"target_role": user["role"]}, {"target_username": user["username"]},
    ]}).sort("created_at", -1).to_list(300)
    return serialize_list(items)


@router.get("/activity-logs")
async def activity_logs(machine_id: Optional[str] = None, work_order_id: Optional[str] = None,
                         user: dict = Depends(get_current_user)):
    q = {}
    if machine_id:
        q["machine_id"] = machine_id
    if work_order_id:
        q["work_order_id"] = work_order_id
    items = await db.maintenance_activity_logs.find(q).sort("created_at", -1).to_list(500)
    return serialize_list(items)


# ---------------------------------------------------------------------------
# Technician dashboard
# ---------------------------------------------------------------------------
@router.get("/dashboard")
async def technician_dashboard(user: dict = Depends(require_roles(*ANY_TECH))):
    tech = user["username"]
    ids = await _visible_machine_ids(user)
    await refresh_pm_statuses()
    wos = await db.maintenance_work_orders.find({"assigned_technician": tech}).to_list(500)
    today = utcnow().date().isoformat()
    pm_due = await db.preventive_maintenance_schedules.count_documents({"technician": tech, "status": "Due"})
    pm_overdue = await db.preventive_maintenance_schedules.count_documents({"technician": tech, "status": "Overdue"})
    cal_due = await db.calibration_records.count_documents({"result": "FAIL", "recalibrated": False, "machine_id": {"$in": ids}})
    critical_alerts = await db.technical_alerts.count_documents({"machine_id": {"$in": ids}, "severity": "Critical", "status": {"$nin": ["Resolved", "Closed"]}})
    parts = await db.technician_parts.find({"technician": tech}).to_list(100)
    unread = await db.notifications.count_documents({"$or": [{"target_username": tech}, {"target_role": user["role"]}], "read": False})
    return {
        "assigned_machines": len(ids),
        "open_work_orders": len([w for w in wos if w["status"] in ACTIVE_STATUSES]),
        "pm_due": pm_due, "pm_overdue": pm_overdue, "calibration_due": cal_due,
        "critical_alerts": critical_alerts,
        "breakdown_repairs": len([w for w in wos if w.get("work_type") == "Breakdown" and w["status"] in ACTIVE_STATUSES]),
        "waiting_for_parts": len([w for w in wos if w["status"] == "Waiting for Parts"]),
        "completed_today": len([w for w in wos if (w.get("closed_at") or "").startswith(today) or (w.get("completed_at") or "").startswith(today)]),
        "spare_parts_on_hand": sum(p.get("available_qty", 0) for p in parts),
        "notifications": unread,
    }


# ---------------------------------------------------------------------------
# Work orders (technician view + actions)
# ---------------------------------------------------------------------------
@router.get("/work-orders")
async def list_work_orders(technician: Optional[str] = None, status: Optional[str] = None,
                            machine_id: Optional[str] = None, work_type: Optional[str] = None,
                            flagged: Optional[bool] = None, active: Optional[bool] = None,
                            user: dict = Depends(get_current_user)):
    q = {}
    if user["role"] == "maintenance_technician":
        q["assigned_technician"] = user["username"]
    elif technician:
        q["assigned_technician"] = technician
    if status:
        q["status"] = status
    if machine_id:
        q["machine_id"] = machine_id
    if work_type:
        q["work_type"] = work_type
    if flagged:
        q["flagged"] = True
    if active and not status:
        q["status"] = {"$in": ACTIVE_STATUSES}
    items = await db.maintenance_work_orders.find(q).sort("created_at", -1).to_list(500)
    return serialize_list(items)


@router.get("/work-orders/{wo_id}")
async def work_order_detail(wo_id: str, user: dict = Depends(get_current_user)):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    diags = await db.machine_diagnostics.find({"work_order_id": wo_id}).sort("created_at", -1).to_list(20)
    cals = await db.calibration_records.find({"work_order_id": wo_id}).sort("created_at", -1).to_list(20)
    tests = await db.component_tests.find({"work_order_id": wo_id}).sort("created_at", -1).to_list(50)
    usage = await db.spare_parts_usage.find({"work_order_id": wo_id}).sort("created_at", -1).to_list(50)
    reqs = await db.spare_parts_requests.find({"work_order_id": wo_id}).sort("requested_at", -1).to_list(50)
    return {
        "work_order": serialize(wo), "diagnostics": serialize_list(diags), "calibrations": serialize_list(cals),
        "component_tests": serialize_list(tests), "parts_used": serialize_list(usage),
        "part_requests": serialize_list(reqs),
    }


class ActionBody(BaseModel):
    action: str
    note: Optional[str] = None


@router.post("/work-orders/{wo_id}/action")
async def work_order_action(wo_id: str, body: ActionBody, user: dict = Depends(require_roles(*ANY_TECH))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if body.action not in WO_ACTIONS:
        raise HTTPException(status_code=400, detail="Unknown action")
    new_status, stage = WO_ACTIONS[body.action]

    if body.action in ("Start Diagnosis", "Start Repair") and not wo.get("qr_verified"):
        raise HTTPException(status_code=400, detail="Scan and verify the machine QR before starting work.")
    if body.action == "Submit for Supervisor Review":
        tests = await db.component_tests.count_documents({"work_order_id": wo_id})
        repair = wo.get("repair") or {}
        if not tests and not repair.get("testing_result"):
            raise HTTPException(status_code=400, detail="Run component testing before submitting for supervisor review.")

    update = {"status": new_status, "updated_at": now_iso()}
    if body.action == "Accept":
        update["accepted_at"] = now_iso()
    if body.action == "Reached Machine":
        update["reached_at"] = now_iso()
    if body.action == "Start Repair":
        update["repair_started_at"] = now_iso()
        update["flagged"] = False
        update["flag"] = None
    if body.action == "Submit for Supervisor Review":
        update["submitted_at"] = now_iso()
    await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": update, "$push": {
        "history": {"stage": stage, "at": now_iso(), "by": user["username"], "note": body.note},
    }})
    if body.action == "Submit for Supervisor Review":
        await notify_supervisor("Pending Supervisor Review",
                                 f"{wo.get('wo_id')} \u00b7 {wo['machine_label']} submitted by {user['username']}",
                                 "/maintenance-supervisor/work-orders?status=Pending%20Supervisor%20Review")
    await log_maint(user, f"Work order {body.action}", wo["machine_id"], wo_id, {"status": new_status})
    await recalc_health(wo["machine_id"])
    return {"message": f"{body.action} recorded", "status": new_status}


class VerifyQRBody(BaseModel):
    qr_code_id: str


@router.post("/work-orders/{wo_id}/verify-qr")
async def verify_machine_qr(wo_id: str, body: VerifyQRBody, user: dict = Depends(require_roles(*ANY_TECH))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if body.qr_code_id != machine_qr(wo["machine_id"]):
        raise HTTPException(status_code=400, detail="Scanned machine does not match this work order.")
    await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": {
        "qr_verified": True, "qr_verified_at": now_iso(), "updated_at": now_iso(),
    }, "$push": {"history": {"stage": "Machine QR Verified", "at": now_iso(), "by": user["username"]}}})
    await log_maint(user, "Machine QR verified", wo["machine_id"], wo_id)
    return {"message": "Machine verified successfully."}


class FlagBody(BaseModel):
    reason: str
    comment: str


@router.post("/work-orders/{wo_id}/flag")
async def flag_work_order(wo_id: str, body: FlagBody, user: dict = Depends(require_roles(*ANY_TECH))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if not body.comment.strip():
        raise HTTPException(status_code=400, detail="Comment is mandatory when flagging an issue.")
    flag = {"reason": body.reason, "comment": body.comment, "at": now_iso(), "by": user["username"]}
    await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": {
        "flagged": True, "flag": flag, "technician_comment": body.comment, "updated_at": now_iso(),
    }, "$push": {"history": {"stage": "Technician Flag", "at": now_iso(), "by": user["username"], "note": f"{body.reason}: {body.comment}"}}})

    esc_reason_map = {
        "Need Part From Warehouse": "Part Unavailable", "Part Not Available": "Part Unavailable",
        "Additional Technical Support Required": "Additional Technical Support",
        "Machine Inaccessible": "Repair Overdue", "Safety Issue": "Safety Issue",
        "Additional Failure Found": "Repeated Failure", "Other": "Additional Technical Support",
    }
    esc_id = await next_seq("ESC")
    await db.escalations.insert_one({
        "id": new_id(), "esc_id": esc_id, "work_order_id": wo_id, "work_order_ref": wo.get("wo_id"),
        "machine_id": wo["machine_id"], "machine_label": wo["machine_label"],
        "issue": wo.get("issue_type") or wo.get("title"), "technician": wo.get("assigned_technician"),
        "reason": esc_reason_map.get(body.reason, "Additional Technical Support"),
        "flag_reason": body.reason, "comment": body.comment, "priority": wo.get("priority", "Medium"),
        "raised_by": user["username"], "created_at": now_iso(), "status": "Open", "comments": [],
    })
    await notify_supervisor("Technician Flag",
                             f"{wo.get('wo_id')} \u00b7 {body.reason} \u2013 {wo['machine_label']}",
                             "/maintenance-supervisor/escalations")
    await log_maint(user, "Flagged work order", wo["machine_id"], wo_id, flag)
    return {"message": "Issue flagged and escalated to the Maintenance Supervisor.", "escalation_id": esc_id}


class CommentBody(BaseModel):
    comment: str


@router.post("/work-orders/{wo_id}/comment")
async def comment_work_order(wo_id: str, body: CommentBody, user: dict = Depends(require_roles(*ANY_TECH))):
    wo = await db.maintenance_work_orders.find_one({"id": wo_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    await db.maintenance_work_orders.update_one({"id": wo_id}, {"$set": {
        "technician_comment": body.comment, "updated_at": now_iso(),
    }, "$push": {"history": {"stage": "Technician Comment", "at": now_iso(), "by": user["username"], "note": body.comment}}})
    return {"message": "Comment added"}


# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------
class DiagnosticItem(BaseModel):
    component: str
    component_id: Optional[str] = None
    reading: Optional[str] = None
    expected: Optional[str] = None
    status: str
    error_code: Optional[str] = None
    comment: Optional[str] = None
    photo: Optional[str] = None


class DiagnosticBody(BaseModel):
    machine_id: str
    work_order_id: Optional[str] = None
    items: List[DiagnosticItem]


@router.get("/diagnostics")
async def list_diagnostics(machine_id: Optional[str] = None, work_order_id: Optional[str] = None,
                            user: dict = Depends(get_current_user)):
    q = {}
    if machine_id:
        q["machine_id"] = machine_id
    if work_order_id:
        q["work_order_id"] = work_order_id
    if user["role"] == "maintenance_technician" and not machine_id and not work_order_id:
        q["technician"] = user["username"]
    items = await db.machine_diagnostics.find(q).sort("created_at", -1).to_list(200)
    return serialize_list(items)


@router.post("/diagnostics")
async def submit_diagnostics(body: DiagnosticBody, user: dict = Depends(require_roles(*ANY_TECH))):
    if not body.items:
        raise HTTPException(status_code=400, detail="Record at least one diagnostic check.")
    for item in body.items:
        if item.status == "Fail" and not (item.comment or "").strip():
            raise HTTPException(status_code=400, detail=f"Comment is mandatory for failed check: {item.component}")
    wo = None
    if body.work_order_id:
        wo = await db.maintenance_work_orders.find_one({"id": body.work_order_id})
        if not wo:
            raise HTTPException(status_code=404, detail="Work order not found")
        if not wo.get("qr_verified"):
            raise HTTPException(status_code=400, detail="Scan and verify the machine QR before recording diagnostics.")
    items = [i.model_dump() for i in body.items]
    summary = {s: len([i for i in items if i["status"] == s]) for s in DIAGNOSTIC_STATUSES}
    doc = {
        "id": new_id(), "diag_id": await next_seq("DG"), "machine_id": body.machine_id,
        "machine_label": machine_label(body.machine_id), "work_order_id": body.work_order_id,
        "work_order_ref": wo.get("wo_id") if wo else None, "technician": user["username"],
        "items": items, "summary": summary,
        "overall_result": "Fail" if summary["Fail"] else ("Warning" if summary["Warning"] else "Pass"),
        "created_at": now_iso(),
    }
    await db.machine_diagnostics.insert_one(doc)
    if wo:
        await db.maintenance_work_orders.update_one({"id": wo["id"]}, {"$set": {
            "status": "Diagnosis Completed", "updated_at": now_iso(),
            "last_diagnostic_result": doc["overall_result"],
        }, "$push": {"history": {"stage": "Diagnosis Completed", "at": now_iso(), "by": user["username"],
                                  "note": f"{summary['Pass']} pass / {summary['Warning']} warning / {summary['Fail']} fail"}}})
    await log_maint(user, "Recorded diagnostics", body.machine_id, body.work_order_id, summary)
    await recalc_health(body.machine_id)
    return serialize(doc)


# ---------------------------------------------------------------------------
# Component testing
# ---------------------------------------------------------------------------
class ComponentTestBody(BaseModel):
    machine_id: str
    work_order_id: Optional[str] = None
    component: str
    command: str
    result: str
    reading: Optional[str] = None
    comment: Optional[str] = None


@router.get("/component-tests")
async def list_component_tests(machine_id: Optional[str] = None, work_order_id: Optional[str] = None,
                                user: dict = Depends(get_current_user)):
    q = {}
    if machine_id:
        q["machine_id"] = machine_id
    if work_order_id:
        q["work_order_id"] = work_order_id
    items = await db.component_tests.find(q).sort("created_at", -1).to_list(300)
    return serialize_list(items)


@router.post("/component-tests")
async def submit_component_test(body: ComponentTestBody, user: dict = Depends(require_roles(*ANY_TECH))):
    doc = {
        "id": new_id(), "machine_id": body.machine_id, "machine_label": machine_label(body.machine_id),
        "work_order_id": body.work_order_id, "component": body.component, "command": body.command,
        "result": body.result, "reading": body.reading, "comment": body.comment,
        "technician": user["username"], "created_at": now_iso(),
    }
    await db.component_tests.insert_one(doc)
    if body.work_order_id:
        wo = await db.maintenance_work_orders.find_one({"id": body.work_order_id})
        if wo:
            await add_stage(wo, "Calibration / Testing", user["username"], f"{body.component}: {body.command} \u2192 {body.result}")
    await log_maint(user, "Component test", body.machine_id, body.work_order_id,
                    {"component": body.component, "command": body.command, "result": body.result})
    return serialize(doc)


# ---------------------------------------------------------------------------
# Breakdown repair
# ---------------------------------------------------------------------------
class RepairBody(BaseModel):
    work_order_id: str
    issue: Optional[str] = None
    error_code: Optional[str] = None
    failed_component: str
    diagnosis_summary: str
    root_cause: str
    repair_action: str
    parts_used: Optional[str] = None
    before_photo: Optional[str] = None
    after_photo: Optional[str] = None
    testing_result: Optional[str] = None
    comment: Optional[str] = None
    repair_start_time: Optional[str] = None
    repair_end_time: Optional[str] = None


@router.post("/repairs")
async def submit_repair(body: RepairBody, user: dict = Depends(require_roles(*ANY_TECH))):
    wo = await db.maintenance_work_orders.find_one({"id": body.work_order_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    if not wo.get("qr_verified"):
        raise HTTPException(status_code=400, detail="Scan and verify the machine QR before recording the repair.")
    if not body.before_photo or not body.after_photo:
        raise HTTPException(status_code=400, detail="Before and after photos are required for a physical repair.")
    repair = body.model_dump()
    repair["recorded_by"] = user["username"]
    repair["recorded_at"] = now_iso()
    repair["repair_start_time"] = body.repair_start_time or wo.get("repair_started_at") or now_iso()
    repair["repair_end_time"] = body.repair_end_time or now_iso()
    await db.maintenance_work_orders.update_one({"id": wo["id"]}, {"$set": {
        "repair": repair, "component": body.failed_component or wo.get("component"),
        "error_code": body.error_code or wo.get("error_code"), "updated_at": now_iso(),
        "status": "Testing" if wo["status"] in ("Repair In Progress", "Waiting for Parts") else wo["status"],
    }, "$push": {"history": {"stage": "Repair Completed", "at": now_iso(), "by": user["username"], "note": body.repair_action}}})
    await log_maint(user, "Recorded breakdown repair", wo["machine_id"], wo["id"], {"component": body.failed_component})
    await recalc_health(wo["machine_id"])
    return {"message": "Repair recorded. Run testing before submitting for supervisor review."}


# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------
class CalibrationBody(BaseModel):
    machine_id: str
    slot_id: Optional[str] = None
    bin_id: Optional[str] = None
    item: Optional[str] = None
    calibration_type: str
    expected_quantity: float
    actual_quantity: float
    unit: str
    run_time_seconds: Optional[float] = None
    work_order_id: Optional[str] = None
    comment: Optional[str] = None


@router.get("/calibrations")
async def list_calibrations(machine_id: Optional[str] = None, bin_id: Optional[str] = None,
                            slot_id: Optional[str] = None, technician: Optional[str] = None,
                            result: Optional[str] = None, date_from: Optional[str] = None,
                            work_order_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    for field, value in [("machine_id", machine_id), ("bin_id", bin_id), ("slot_id", slot_id),
                          ("technician", technician), ("result", result), ("work_order_id", work_order_id)]:
        if value:
            q[field] = value
    if date_from:
        q["created_at"] = {"$gte": date_from}
    items = await db.calibration_records.find(q).sort("created_at", -1).to_list(500)
    return serialize_list(items)


@router.post("/calibrations")
async def submit_calibration(body: CalibrationBody, user: dict = Depends(require_roles(*ANY_TECH))):
    if body.expected_quantity == 0:
        # Load cell zero check: absolute tolerance of 2 g
        difference = round(body.actual_quantity, 3)
        variance_pct = 0.0
        result = "PASS" if abs(difference) <= 2 else "FAIL"
    else:
        difference, variance_pct, result = calc_calibration(body.expected_quantity, body.actual_quantity)
    if result == "FAIL" and not (body.comment or "").strip():
        raise HTTPException(status_code=400, detail="A comment is mandatory when the calibration result is FAIL.")

    wo = await db.maintenance_work_orders.find_one({"id": body.work_order_id}) if body.work_order_id else None
    doc = {
        "id": new_id(), "cal_id": await next_seq("CAL"), "machine_id": body.machine_id,
        "machine_label": machine_label(body.machine_id), "slot_id": body.slot_id, "bin_id": body.bin_id,
        "item": body.item, "calibration_type": body.calibration_type,
        "expected_quantity": body.expected_quantity, "actual_quantity": body.actual_quantity,
        "unit": body.unit, "difference": difference, "variance_pct": variance_pct, "result": result,
        "run_time_seconds": body.run_time_seconds, "technician": user["username"],
        "work_order_id": body.work_order_id, "work_order_ref": wo.get("wo_id") if wo else None,
        "comment": body.comment, "created_at": now_iso(), "next_due": iso_in(days=30),
        "recalibrated": False, "recalibration_required": result == "FAIL",
        "status": "Failed" if result == "FAIL" else "Passed",
    }
    await db.calibration_records.insert_one(doc)
    if wo:
        await add_stage(wo, "Calibration / Testing", user["username"],
                        f"{body.calibration_type}: {result} ({variance_pct}%)")
    if result == "FAIL":
        await create_technical_alert(body.machine_id, "Calibration Failure", severity="High",
                                     detail=f"{body.calibration_type} failed on {body.slot_id or body.bin_id or body.item} (variance {variance_pct}%).")
    await log_maint(user, f"Calibration {result}", body.machine_id, body.work_order_id,
                    {"type": body.calibration_type, "variance_pct": variance_pct})
    await recalc_health(body.machine_id)
    return serialize(doc)


@router.get("/calibration-targets")
async def calibration_targets(machine_id: str, user: dict = Depends(get_current_user)):
    """Slot + bin + ingredient + unit master data for the calibration form (shared master data)."""
    slots = await db.machine_slots.find({"machine_id": machine_id}).to_list(100)
    out = []
    for s in slots:
        out.append({
            "slot_id": s["slot_code"], "slot_record_id": s["id"], "bin_id": s.get("current_bin_id"),
            "ingredient_code": s["ingredient_code"], "item": s["ingredient_name"], "unit": s["unit"],
            "slot_type": s["slot_type"], "capacity": s["capacity"],
        })
    out.sort(key=lambda x: (x["slot_type"], x["slot_id"]))
    return out


# ---------------------------------------------------------------------------
# Preventive maintenance (technician execution)
# ---------------------------------------------------------------------------
@router.get("/pm-tasks")
async def list_pm_tasks(technician: Optional[str] = None, status: Optional[str] = None,
                         machine_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    await refresh_pm_statuses()
    q = {}
    if user["role"] == "maintenance_technician":
        q["technician"] = user["username"]
    elif technician:
        q["technician"] = technician
    if status:
        q["status"] = status
    if machine_id:
        q["machine_id"] = machine_id
    items = await db.preventive_maintenance_schedules.find(q).sort("due_at", 1).to_list(300)
    return serialize_list(items)


@router.post("/pm-tasks/{pm_id}/start")
async def start_pm(pm_id: str, user: dict = Depends(require_roles(*ANY_TECH))):
    pm = await db.preventive_maintenance_schedules.find_one({"id": pm_id})
    if not pm:
        raise HTTPException(status_code=404, detail="PM task not found")
    steps = pm.get("steps") or [{"step": s, "requires_photo": p, "status": "Not Started", "comment": None,
                                 "before_photo": None, "after_photo": None, "completed_at": None}
                                for s, p in PM_CHECKLIST]
    await db.preventive_maintenance_schedules.update_one({"id": pm_id}, {"$set": {
        "status": "In Progress", "steps": steps, "started_at": now_iso(), "started_by": user["username"],
    }})
    await log_maint(user, "Started preventive maintenance", pm["machine_id"], pm.get("work_order_id"), {"pm_id": pm.get("pm_id")})
    return {"message": "Preventive maintenance started", "steps": steps}


class PMStepBody(BaseModel):
    step: str
    status: str
    comment: Optional[str] = None
    before_photo: Optional[str] = None
    after_photo: Optional[str] = None


@router.post("/pm-tasks/{pm_id}/step")
async def update_pm_step(pm_id: str, body: PMStepBody, user: dict = Depends(require_roles(*ANY_TECH))):
    pm = await db.preventive_maintenance_schedules.find_one({"id": pm_id})
    if not pm:
        raise HTTPException(status_code=404, detail="PM task not found")
    steps = pm.get("steps") or []
    found = False
    for s in steps:
        if s["step"] == body.step:
            found = True
            if body.status in ("Fail", "Needs Attention") and not (body.comment or "").strip():
                raise HTTPException(status_code=400, detail="Comment is mandatory when a step is marked Fail or Needs Attention.")
            if s.get("requires_photo") and body.status in ("Pass", "Completed") and not (body.after_photo or s.get("after_photo")):
                raise HTTPException(status_code=400, detail=f"'{body.step}' is a physical maintenance step \u2014 an after photo is required.")
            s.update({"status": body.status, "comment": body.comment or s.get("comment"),
                       "before_photo": body.before_photo or s.get("before_photo"),
                       "after_photo": body.after_photo or s.get("after_photo"),
                       "completed_at": now_iso(), "completed_by": user["username"]})
    if not found:
        raise HTTPException(status_code=404, detail="Checklist step not found")
    await db.preventive_maintenance_schedules.update_one({"id": pm_id}, {"$set": {"steps": steps}})
    done = len([s for s in steps if s["status"] != "Not Started"])
    return {"message": f"{body.step} updated", "completed_steps": done, "total_steps": len(steps)}


@router.post("/pm-tasks/{pm_id}/submit")
async def submit_pm(pm_id: str, user: dict = Depends(require_roles(*ANY_TECH))):
    pm = await db.preventive_maintenance_schedules.find_one({"id": pm_id})
    if not pm:
        raise HTTPException(status_code=404, detail="PM task not found")
    steps = pm.get("steps") or []
    pending = [s["step"] for s in steps if s["status"] == "Not Started"]
    if pending:
        raise HTTPException(status_code=400, detail=f"{len(pending)} checklist step(s) are still Not Started. Complete them before submitting.")
    await db.preventive_maintenance_schedules.update_one({"id": pm_id}, {"$set": {
        "status": "Completed", "completed_at": now_iso(), "completed_by": user["username"],
        "last_completed_at": now_iso(), "next_due_at": next_due_from(pm.get("frequency", "Quarterly")),
    }})
    if pm.get("work_order_id"):
        wo = await db.maintenance_work_orders.find_one({"id": pm["work_order_id"]})
        if wo:
            await db.maintenance_work_orders.update_one({"id": wo["id"]}, {"$set": {
                "status": "Pending Supervisor Review", "submitted_at": now_iso(), "updated_at": now_iso(),
            }, "$push": {"history": {"stage": "Submitted for Supervisor Review", "at": now_iso(), "by": user["username"], "note": "PM checklist completed"}}})
    await notify_supervisor("PM Completed", f"{pm.get('pm_id')} completed on {pm['machine_label']}",
                             "/maintenance-supervisor/pm-planner")
    await log_maint(user, "Completed preventive maintenance", pm["machine_id"], pm.get("work_order_id"), {"pm_id": pm.get("pm_id")})
    await recalc_health(pm["machine_id"])
    return {"message": "Preventive maintenance submitted for supervisor review."}


# ---------------------------------------------------------------------------
# Technician spare parts inventory / replacement / requests
# ---------------------------------------------------------------------------
@router.get("/my-parts")
async def my_parts(technician: Optional[str] = None, user: dict = Depends(require_roles(*ANY_TECH))):
    tech = user["username"] if user["role"] == "maintenance_technician" else (technician or user["username"])
    items = await db.technician_parts.find({"technician": tech}).sort("part_name", 1).to_list(200)
    return serialize_list(items)


class PartsReplacementBody(BaseModel):
    work_order_id: str
    component: str
    part_code: str
    old_part_code: Optional[str] = None
    new_part_code: Optional[str] = None
    part_name: str
    serial_number: Optional[str] = None
    quantity: int = 1
    reason: str
    testing_result: Optional[str] = None
    comment: Optional[str] = None


@router.post("/parts-replacement")
async def record_parts_replacement(body: PartsReplacementBody, user: dict = Depends(require_roles(*ANY_TECH))):
    wo = await db.maintenance_work_orders.find_one({"id": body.work_order_id})
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    stock = await db.technician_parts.find_one({"technician": user["username"], "part_code": body.part_code})
    if not stock or stock.get("available_qty", 0) < body.quantity:
        raise HTTPException(status_code=400, detail="You do not have enough of this part. Raise a spare part request first.")
    await db.technician_parts.update_one({"id": stock["id"]}, {
        "$inc": {"available_qty": -body.quantity, "used_qty": body.quantity},
        "$set": {"last_used_machine": wo["machine_id"], "last_used_machine_label": wo["machine_label"],
                  "last_used_work_order": wo.get("wo_id"), "last_used_at": now_iso()},
    })
    await db.spare_parts_inventory.update_one({"part_code": body.part_code}, {
        "$inc": {"assigned_qty": -body.quantity, "total_stock": -body.quantity},
    })
    usage = {
        "id": new_id(), "work_order_id": wo["id"], "work_order_ref": wo.get("wo_id"),
        "machine_id": wo["machine_id"], "machine_label": wo["machine_label"], "component": body.component,
        "part_code": body.part_code, "old_part_code": body.old_part_code, "new_part_code": body.new_part_code or body.part_code,
        "part_name": body.part_name, "serial_number": body.serial_number, "quantity": body.quantity,
        "reason": body.reason, "technician": user["username"], "testing_result": body.testing_result,
        "comment": body.comment, "created_at": now_iso(),
    }
    await db.spare_parts_usage.insert_one(usage)
    await db.maintenance_work_orders.update_one({"id": wo["id"]}, {
        "$push": {"parts_used": {"part_code": body.part_code, "part_name": body.part_name, "quantity": body.quantity, "at": now_iso()},
                   "history": {"stage": "Repair Started", "at": now_iso(), "by": user["username"],
                                "note": f"Replaced {body.part_name} ({body.quantity})"}},
        "$set": {"updated_at": now_iso()},
    })
    await db.spare_parts_requests.update_many({"work_order_id": wo["id"], "part_code": body.part_code, "status": "Received"},
                                              {"$set": {"status": "Used"}})
    await log_maint(user, "Replaced part", wo["machine_id"], wo["id"], {"part": body.part_name, "qty": body.quantity})
    await recalc_health(wo["machine_id"])
    return {"message": f"{body.part_name} replacement recorded", "usage": serialize(usage)}


@router.get("/parts-usage")
async def parts_usage(technician: Optional[str] = None, machine_id: Optional[str] = None,
                       user: dict = Depends(get_current_user)):
    q = {}
    if user["role"] == "maintenance_technician":
        q["technician"] = user["username"]
    elif technician:
        q["technician"] = technician
    if machine_id:
        q["machine_id"] = machine_id
    items = await db.spare_parts_usage.find(q).sort("created_at", -1).to_list(300)
    return serialize_list(items)


class SparePartRequestBody(BaseModel):
    part_code: str
    part_name: str
    quantity: int = 1
    work_order_id: Optional[str] = None
    machine_id: str
    reason: str
    priority: str = "Medium"
    comment: Optional[str] = None


@router.get("/spare-parts-requests")
async def list_spare_part_requests(technician: Optional[str] = None, status: Optional[str] = None,
                                    user: dict = Depends(get_current_user)):
    q = {}
    if user["role"] == "maintenance_technician":
        q["technician"] = user["username"]
    elif technician:
        q["technician"] = technician
    if status:
        q["status"] = status
    items = await db.spare_parts_requests.find(q).sort("requested_at", -1).to_list(300)
    return serialize_list(items)


@router.post("/spare-parts-requests")
async def create_spare_part_request(body: SparePartRequestBody, user: dict = Depends(require_roles(*ANY_TECH))):
    wo = await db.maintenance_work_orders.find_one({"id": body.work_order_id}) if body.work_order_id else None
    doc = {
        "id": new_id(), "req_id": await next_seq("SPR"), "technician": user["username"],
        "part_code": body.part_code, "part_name": body.part_name, "quantity": body.quantity,
        "work_order_id": body.work_order_id, "work_order_ref": wo.get("wo_id") if wo else None,
        "machine_id": body.machine_id, "machine_label": machine_label(body.machine_id),
        "reason": body.reason, "priority": body.priority, "comment": body.comment,
        "status": "Requested", "requested_at": now_iso(), "supervisor_comment": None,
    }
    await db.spare_parts_requests.insert_one(doc)
    if wo:
        await db.maintenance_work_orders.update_one({"id": wo["id"]}, {"$set": {
            "status": "Waiting for Parts", "updated_at": now_iso(),
        }, "$push": {"history": {"stage": "Waiting for Parts", "at": now_iso(), "by": user["username"],
                                  "note": f"Requested {body.quantity}x {body.part_name}"}}})
    await notify_supervisor("Spare Part Request",
                             f"{user['username']} requested {body.quantity}x {body.part_name} for {doc['machine_label']}",
                             "/maintenance-supervisor/spare-parts-approvals")
    await log_maint(user, "Requested spare part", body.machine_id, body.work_order_id,
                    {"part": body.part_name, "qty": body.quantity})
    return serialize(doc)


@router.post("/spare-parts-requests/{req_id}/receive")
async def receive_spare_part(req_id: str, user: dict = Depends(require_roles(*ANY_TECH))):
    req = await db.spare_parts_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "Issued":
        raise HTTPException(status_code=400, detail="Only issued parts can be marked as received.")
    await db.spare_parts_requests.update_one({"id": req_id}, {"$set": {"status": "Received", "received_at": now_iso()}})
    stock = await db.technician_parts.find_one({"technician": req["technician"], "part_code": req["part_code"]})
    if stock:
        await db.technician_parts.update_one({"id": stock["id"]}, {"$inc": {
            "assigned_qty": req["quantity"], "available_qty": req["quantity"],
        }})
    else:
        await db.technician_parts.insert_one({
            "id": new_id(), "technician": req["technician"], "part_code": req["part_code"],
            "part_name": req["part_name"], "assigned_qty": req["quantity"], "used_qty": 0,
            "available_qty": req["quantity"], "min_qty": 1, "last_used_machine": None,
            "last_used_work_order": None, "last_used_at": None,
        })
    if req.get("work_order_id"):
        wo = await db.maintenance_work_orders.find_one({"id": req["work_order_id"]})
        if wo:
            await db.maintenance_work_orders.update_one({"id": wo["id"]}, {"$set": {
                "status": "Repair In Progress", "updated_at": now_iso(),
            }, "$push": {"history": {"stage": "Part Issued", "at": now_iso(), "by": user["username"],
                                      "note": f"{req['part_name']} received by technician"}}})
    await log_maint(user, "Received spare part", req.get("machine_id"), req.get("work_order_id"), {"part": req["part_name"]})
    return {"message": f"{req['part_name']} received and added to your inventory."}


# ---------------------------------------------------------------------------
# Door / panel access
# ---------------------------------------------------------------------------
@router.get("/panel-access")
async def panel_access_logs(machine_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"machine_id": machine_id} if machine_id else {}
    logs = await db.panel_access_logs.find(q).sort("created_at", -1).to_list(200)
    return {"panels": PANELS, "logs": serialize_list(logs)}


class PanelBody(BaseModel):
    machine_id: str
    panel: str
    command: str


@router.post("/panel-access")
async def panel_access_action(body: PanelBody, user: dict = Depends(require_roles(*ANY_TECH))):
    ids = await _visible_machine_ids(user)
    if body.machine_id not in ids:
        raise HTTPException(status_code=403, detail="This machine is not assigned to you.")
    doc = {
        "id": new_id(), "machine_id": body.machine_id, "machine_label": machine_label(body.machine_id),
        "panel": body.panel, "command": body.command, "technician": user["username"],
        "result": "Success", "created_at": now_iso(),
    }
    await db.panel_access_logs.insert_one(doc)
    await log_maint(user, f"{body.panel} {body.command}", body.machine_id, None, {"panel": body.panel})
    return {"message": f"{body.panel}: {body.command} command sent successfully.", "log": serialize(doc)}


# ---------------------------------------------------------------------------
# Service history
# ---------------------------------------------------------------------------
@router.get("/service-history")
async def service_history(machine_id: Optional[str] = None, technician: Optional[str] = None,
                           user: dict = Depends(get_current_user)):
    q = {}
    if user["role"] == "maintenance_technician":
        q["technician"] = user["username"]
    elif technician:
        q["technician"] = technician
    if machine_id:
        q["machine_id"] = machine_id
    items = await db.service_history.find(q).sort("date", -1).to_list(300)
    return serialize_list(items)
