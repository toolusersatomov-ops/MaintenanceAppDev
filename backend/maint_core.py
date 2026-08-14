"""Shared helpers for the Maintenance modules: sequential IDs, activity logs,
work-order timeline, machine technical health scoring and service history."""
from datetime import datetime, timezone, timedelta

from database import db
from auth_utils import new_id, now_iso
from seed_constants import machine_label
from utils import push_notification
from maint_constants import (
    TOLERANCE_PCT, ALERT_TYPE_MASTER, health_status_for, FREQUENCY_DAYS,
)


def parse_iso(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def utcnow():
    return datetime.now(timezone.utc)


def iso_in(days=0, hours=0, minutes=0):
    return (utcnow() + timedelta(days=days, hours=hours, minutes=minutes)).isoformat()


async def next_seq(prefix: str) -> str:
    doc = await db.maint_counters.find_one_and_update(
        {"_id": prefix}, {"$inc": {"seq": 1}}, upsert=True, return_document=True,
    )
    seq = doc.get("seq", 1) if doc else 1
    return f"{prefix}-{seq:04d}"


async def log_maint(user: dict, action: str, machine_id: str = None, work_order_id: str = None, details: dict = None):
    await db.maintenance_activity_logs.insert_one({
        "id": new_id(),
        "username": user["username"],
        "name": user.get("name"),
        "role": user["role"],
        "action": action,
        "machine_id": machine_id,
        "machine_label": machine_label(machine_id) if machine_id else None,
        "work_order_id": work_order_id,
        "details": details or {},
        "created_at": now_iso(),
    })


async def add_stage(wo: dict, stage: str, by: str, note: str = None):
    await db.maintenance_work_orders.update_one({"id": wo["id"]}, {
        "$set": {"updated_at": now_iso()},
        "$push": {"history": {"stage": stage, "at": now_iso(), "by": by, "note": note}},
    })


async def notify_technician(username: str, title: str, message: str, link: str = "/technician/work-orders"):
    if username:
        await push_notification(target_username=username, title=title, message=message, link=link)


async def notify_supervisor(title: str, message: str, link: str = "/maintenance-supervisor/dashboard"):
    await push_notification(target_role="maintenance_supervisor", title=title, message=message, link=link)


# ---------------------------------------------------------------------------
# Technical alerts
# ---------------------------------------------------------------------------
async def create_technical_alert(machine_id: str, alert_type: str, severity: str = None,
                                  component: str = None, error_code: str = None, detail: str = None):
    master = ALERT_TYPE_MASTER.get(alert_type, ("Other", "E-GEN-00", "Medium", "Investigate and resolve."))
    alert_id = await next_seq("TA")
    doc = {
        "id": new_id(), "alert_id": alert_id, "machine_id": machine_id, "machine_label": machine_label(machine_id),
        "alert_type": alert_type, "component": component or master[0], "error_code": error_code or master[1],
        "severity": severity or master[2], "suggested_action": master[3], "detail": detail,
        "status": "Open", "created_at": now_iso(), "work_order_id": None, "work_order_ref": None,
        "acknowledged_by": None, "resolution_note": None,
    }
    await db.technical_alerts.insert_one(doc)
    await notify_supervisor("Critical Technical Alert" if doc["severity"] == "Critical" else "New Technical Alert",
                             f"{alert_type} on {doc['machine_label']} ({doc['error_code']})",
                             "/maintenance-supervisor/technical-alerts")
    await recalc_health(machine_id)
    return doc


# ---------------------------------------------------------------------------
# Calibration maths — the system decides PASS / FAIL, never the technician
# ---------------------------------------------------------------------------
def calc_calibration(expected: float, actual: float):
    difference = round(actual - expected, 3)
    variance_pct = round((difference / expected) * 100, 2) if expected else 0.0
    result = "PASS" if abs(variance_pct) <= TOLERANCE_PCT else "FAIL"
    return difference, variance_pct, result


# ---------------------------------------------------------------------------
# Machine technical health
# ---------------------------------------------------------------------------
async def recalc_health(machine_id: str):
    machine = await db.machines.find_one({"id": machine_id})
    if not machine:
        return None
    alerts = await db.technical_alerts.find({"machine_id": machine_id, "status": {"$nin": ["Resolved", "Closed"]}}).to_list(200)
    wos = await db.maintenance_work_orders.find({"machine_id": machine_id}).to_list(500)
    open_wos = [w for w in wos if w["status"] not in ("Closed",)]

    score = 100
    for a in alerts:
        score -= {"Critical": 25, "High": 12, "Medium": 6, "Low": 3}.get(a.get("severity"), 5)

    diags = await db.machine_diagnostics.find({"machine_id": machine_id}).sort("created_at", -1).to_list(5)
    failed_components = []
    if diags:
        for item in diags[0].get("items", []):
            if item.get("status") == "Fail":
                failed_components.append(item["component"])
                score -= 8
            elif item.get("status") == "Warning":
                score -= 3

    failed_cals = await db.calibration_records.count_documents({"machine_id": machine_id, "result": "FAIL", "recalibrated": False})
    score -= failed_cals * 8

    pms = await db.preventive_maintenance_schedules.find({"machine_id": machine_id}).to_list(50)
    overdue_pm = [p for p in pms if p.get("status") == "Overdue"]
    score -= len(overdue_pm) * 12

    # repeated failure: same component breaking down 3+ times
    by_component = {}
    for w in wos:
        if w.get("work_type") == "Breakdown" and w.get("component"):
            by_component[w["component"]] = by_component.get(w["component"], 0) + 1
    repeated = [c for c, n in by_component.items() if n >= 3]
    score -= len(repeated) * 10

    score = max(0, min(100, int(round(score))))

    machine_down = any(a.get("alert_type") == "Machine Down" for a in alerts)
    under_maintenance = any(w["status"] in ("In Transit", "Reached Machine", "Diagnosis Started", "Diagnosis Completed",
                                            "Repair In Progress", "Waiting for Parts", "Testing")
                            and w.get("priority") in ("High", "Critical") for w in open_wos)
    if machine_down:
        health_status = "Down"
        score = min(score, 35)
    elif under_maintenance:
        health_status = "Under Maintenance"
    else:
        health_status = health_status_for(score)

    downtime_minutes = 0
    if machine_down:
        for a in alerts:
            if a.get("alert_type") == "Machine Down":
                started = parse_iso(a.get("created_at"))
                if started:
                    downtime_minutes = int((utcnow() - started).total_seconds() // 60)
                break

    closed = [w for w in wos if w.get("closed_at")]
    last_maintenance = max((w["closed_at"] for w in closed), default=None)
    next_pm = min((p["due_at"] for p in pms if p.get("status") in ("Due", "Scheduled", "Overdue") and p.get("due_at")), default=None)
    last_cal_doc = await db.calibration_records.find({"machine_id": machine_id}).sort("created_at", -1).to_list(1)

    doc = {
        "machine_id": machine_id, "machine_label": machine_label(machine_id),
        "location": machine.get("location"), "machine_status": machine.get("status"),
        "health_score": score, "health_status": health_status,
        "active_alerts": len(alerts),
        "active_error_codes": sorted({a.get("error_code") for a in alerts if a.get("error_code")}),
        "active_faults": sorted({a.get("alert_type") for a in alerts if a.get("alert_type")}),
        "critical_alerts": len([a for a in alerts if a.get("severity") == "Critical"]),
        "open_work_orders": len(open_wos),
        "failed_components": failed_components,
        "failed_calibrations": failed_cals,
        "overdue_pm": len(overdue_pm),
        "repeated_failures": repeated,
        "downtime_minutes": downtime_minutes,
        "last_maintenance": last_maintenance,
        "next_pm_due": next_pm,
        "last_calibration": last_cal_doc[0]["created_at"] if last_cal_doc else None,
        "assigned_technician": machine.get("assigned_technician"),
        "updated_at": now_iso(),
    }
    existing = await db.machine_health_logs.find_one({"machine_id": machine_id})
    if existing:
        await db.machine_health_logs.update_one({"machine_id": machine_id}, {"$set": doc})
        doc["id"] = existing["id"]
    else:
        doc["id"] = new_id()
        await db.machine_health_logs.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


async def recalc_all_health():
    machines = await db.machines.find().to_list(100)
    for m in machines:
        await recalc_health(m["id"])


async def refresh_pm_statuses():
    now = utcnow()
    pms = await db.preventive_maintenance_schedules.find({"status": {"$in": ["Scheduled", "Due", "Overdue"]}}).to_list(500)
    for p in pms:
        due = parse_iso(p.get("due_at"))
        if not due:
            continue
        if due < now:
            new_status = "Overdue"
        elif (due - now) <= timedelta(days=3):
            new_status = "Due"
        else:
            new_status = "Scheduled"
        if new_status != p["status"]:
            await db.preventive_maintenance_schedules.update_one({"id": p["id"]}, {"$set": {"status": new_status}})


def next_due_from(frequency: str, base: datetime = None):
    days = FREQUENCY_DAYS.get(frequency, 45)
    return ((base or utcnow()) + timedelta(days=days)).isoformat()


# ---------------------------------------------------------------------------
# Service history
# ---------------------------------------------------------------------------
async def write_service_history(wo: dict, supervisor_review: str, final_status: str):
    diag = await db.machine_diagnostics.find({"work_order_id": wo["id"]}).sort("created_at", -1).to_list(1)
    cals = await db.calibration_records.find({"work_order_id": wo["id"]}).to_list(20)
    tests = await db.component_tests.find({"work_order_id": wo["id"]}).to_list(50)
    usage = await db.spare_parts_usage.find({"work_order_id": wo["id"]}).to_list(50)
    repair = wo.get("repair") or {}
    created = parse_iso(wo.get("created_at"))
    downtime = int(((parse_iso(wo.get("closed_at")) or utcnow()) - created).total_seconds() // 60) if created else 0
    doc = {
        "id": new_id(), "machine_id": wo["machine_id"], "machine_label": wo["machine_label"],
        "work_order_id": wo["id"], "work_order_ref": wo.get("wo_id"), "date": now_iso(),
        "issue": wo.get("issue_type") or wo.get("title"), "component": wo.get("component"),
        "error_code": wo.get("error_code"),
        "diagnosis": repair.get("diagnosis_summary") or (diag[0].get("overall_result") if diag else None),
        "repair": repair.get("repair_action"),
        "parts_used": [f"{u['part_name']} x{u['quantity']}" for u in usage],
        "calibration_performed": [f"{c['calibration_type']} ({c['result']})" for c in cals],
        "test_result": repair.get("testing_result") or (tests[-1]["result"] if tests else None),
        "downtime_minutes": downtime, "technician": wo.get("assigned_technician"),
        "supervisor_review": supervisor_review, "final_status": final_status,
    }
    await db.service_history.insert_one(doc)
    return doc


async def technician_workload(username: str):
    q = {"assigned_technician": username}
    active = await db.maintenance_work_orders.count_documents({**q, "status": {"$nin": ["Closed", "Completed"]}})
    critical = await db.maintenance_work_orders.count_documents({**q, "status": {"$nin": ["Closed", "Completed"]}, "priority": {"$in": ["High", "Critical"]}})
    waiting = await db.maintenance_work_orders.count_documents({**q, "status": "Waiting for Parts"})
    today = utcnow().date().isoformat()
    completed_today = await db.maintenance_work_orders.count_documents({**q, "closed_at": {"$gte": today}})
    overdue = 0
    current_task = None
    for w in await db.maintenance_work_orders.find({**q, "status": {"$nin": ["Closed", "Completed"]}}).sort("created_at", -1).to_list(200):
        due = parse_iso(w.get("due_at"))
        if due and due < utcnow():
            overdue += 1
        if w["status"] not in ("Assigned",) and current_task is None:
            current_task = f"{w.get('wo_id')} \u00b7 {w['machine_label']} \u00b7 {w['status']}"
    return {
        "active_work_orders": active, "critical_tasks": critical, "waiting_for_parts": waiting,
        "overdue_tasks": overdue, "completed_today": completed_today, "current_task": current_task,
        "availability": "Busy" if active >= 3 else ("Working" if active else "Available"),
    }
