import csv
import io
from collections import defaultdict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional
from database import db, serialize_list
from auth_utils import get_current_user
from seed_constants import RECIPES, OPERATIONS_REPORTS, MAINTENANCE_REPORTS

router = APIRouter(prefix="/api/reports", tags=["reports"])

RECIPE_BY_NO = {r["no"]: r for r in RECIPES}


@router.get("/list")
async def report_list(user: dict = Depends(get_current_user)):
    return {"operations_reports": OPERATIONS_REPORTS, "maintenance_reports": MAINTENANCE_REPORTS}


async def _sales_query(date_from, date_to, machine_id):
    q = {}
    if date_from:
        q["date"] = {"$gte": date_from}
    if date_to:
        q.setdefault("date", {})
        if isinstance(q["date"], dict):
            q["date"]["$lte"] = date_to
        else:
            q["date"] = {"$lte": date_to}
    if machine_id:
        q["machine_id"] = machine_id
    return await db.sales_orders.find(q).to_list(20000)


async def report_sales(date_from, date_to, machine_id):
    orders = await _sales_query(date_from, date_to, machine_id)
    total_amount = sum(o["amount"] for o in orders)
    by_day = defaultdict(lambda: {"cups": 0, "amount": 0})
    for o in orders:
        by_day[o["date"]]["cups"] += 1
        by_day[o["date"]]["amount"] += o["amount"]
    rows = [{"date": d, "cups_sold": v["cups"], "revenue": v["amount"]} for d, v in sorted(by_day.items())]
    kpis = [{"label": "Total Revenue", "value": total_amount}, {"label": "Total Cups Sold", "value": len(orders)},
            {"label": "Avg Order Value", "value": round(total_amount / len(orders), 2) if orders else 0}]
    return kpis, ["date", "cups_sold", "revenue"], rows


async def report_machine_sales(date_from, date_to, machine_id):
    orders = await _sales_query(date_from, date_to, machine_id)
    by_machine = defaultdict(lambda: {"cups": 0, "amount": 0})
    for o in orders:
        by_machine[o["machine_label"]]["cups"] += 1
        by_machine[o["machine_label"]]["amount"] += o["amount"]
    rows = [{"machine": k, "cups_sold": v["cups"], "revenue": v["amount"]} for k, v in sorted(by_machine.items())]
    kpis = [{"label": "Machines Sold From", "value": len(by_machine)}, {"label": "Total Revenue", "value": sum(o["amount"] for o in orders)}]
    return kpis, ["machine", "cups_sold", "revenue"], rows


async def report_ingredient_consumption(date_from, date_to, machine_id):
    orders = await _sales_query(date_from, date_to, machine_id)
    consumption = defaultdict(float)
    for o in orders:
        recipe = RECIPE_BY_NO.get(o["drink_no"])
        if not recipe:
            continue
        for code, qty in recipe["ingredients"].items():
            consumption[code] += qty
    ing = await db.ingredient_master.find().to_list(200)
    name_map = {i["code"]: i for i in ing}
    rows = [{"ingredient": name_map.get(c, {}).get("name", c), "code": c,
             "total_consumed": round(v, 2), "unit": name_map.get(c, {}).get("unit", "")}
            for c, v in sorted(consumption.items(), key=lambda x: -x[1])]
    kpis = [{"label": "Ingredients Tracked", "value": len(rows)}, {"label": "Cups Sold", "value": len(orders)}]
    return kpis, ["ingredient", "code", "total_consumed", "unit"], rows


async def report_low_stock(date_from, date_to, machine_id):
    q = {"status": {"$in": ["Low Stock", "Near Expiry", "Replacement Due"]}}
    if machine_id:
        q["machine_id"] = machine_id
    slots = await db.machine_slots.find(q).to_list(500)
    rows = [{"machine": s["machine_label"], "ingredient": s["ingredient_name"], "status": s["status"],
             "current_quantity": s["current_quantity"], "unit": s["unit"], "level_pct": s["current_level_pct"]} for s in slots]
    kpis = [{"label": "Total Flagged Slots", "value": len(rows)},
            {"label": "Low Stock", "value": len([s for s in slots if s["status"] == "Low Stock"])}]
    return kpis, ["machine", "ingredient", "status", "current_quantity", "unit", "level_pct"], rows


async def report_bin_replacement(date_from, date_to, machine_id):
    q = {"machine_id": machine_id} if machine_id else {}
    items = await db.bin_replacement_tasks.find(q).sort("created_at", -1).to_list(1000)
    rows = [{"machine": t["machine_label"], "ingredient": t["ingredient_name"], "status": t["status"],
             "stage": t.get("stage"), "assigned_to": t.get("assigned_operations_staff"), "created_at": t["created_at"]} for t in items]
    kpis = [{"label": "Total Tasks", "value": len(rows)}, {"label": "Completed", "value": len([r for r in rows if r["status"] == "Completed"])}]
    return kpis, ["machine", "ingredient", "status", "stage", "assigned_to", "created_at"], rows


async def report_staff_productivity(date_from, date_to, machine_id):
    staff = await db.users.find({"role": "operations_staff"}).to_list(20)
    rows = []
    for s in staff:
        picked = await db.pickup_tasks.count_documents({"assigned_operations_staff": s["username"], "status": "Picked"})
        replaced = await db.bin_replacement_tasks.count_documents({"assigned_operations_staff": s["username"], "status": "Completed"})
        cleaned = await db.cleaning_tasks.count_documents({"status": "Completed"})
        rows.append({"staff": s["username"], "name": s["name"], "bins_picked": picked, "bins_replaced": replaced, "cleaning_completed": cleaned})
    kpis = [{"label": "Active Staff", "value": len(rows)}]
    return kpis, ["staff", "name", "bins_picked", "bins_replaced", "cleaning_completed"], rows


async def report_cleaning_compliance(date_from, date_to, machine_id):
    q = {"machine_id": machine_id} if machine_id else {}
    tasks = await db.cleaning_tasks.find(q).to_list(500)
    completed = len([t for t in tasks if t["status"] == "Completed"])
    rows = [{"machine": t["machine_label"], "date": t["date"], "status": t["status"]} for t in tasks]
    kpis = [{"label": "Total Sessions", "value": len(tasks)}, {"label": "Compliance %", "value": round(completed / len(tasks) * 100, 1) if tasks else 0}]
    return kpis, ["machine", "date", "status"], rows


async def report_dirty_bin_lifecycle(date_from, date_to, machine_id):
    q = {"machine_id": machine_id} if machine_id else {}
    items = await db.dirty_bin_returns.find(q).sort("returned_at", -1).to_list(500)
    rows = [{"machine": d["machine_label"], "ingredient": d["ingredient_name"], "status": d["status"], "returned_at": d["returned_at"]} for d in items]
    kpis = [{"label": "Total Dirty Bins", "value": len(rows)}, {"label": "Fully Cleaned", "value": len([r for r in rows if r["status"] == "Clean / Ready for Filling"])}]
    return kpis, ["machine", "ingredient", "status", "returned_at"], rows


async def report_user_activity(date_from, date_to, machine_id):
    logs = await db.activity_logs.find().sort("created_at", -1).to_list(1000)
    rows = [{"username": log["username"], "role": log["role"], "action": log["action"], "created_at": log["created_at"]} for log in logs]
    kpis = [{"label": "Total Actions Logged", "value": len(rows)}]
    return kpis, ["username", "role", "action", "created_at"], rows


async def report_work_order_summary(date_from, date_to, machine_id):
    q = {"machine_id": machine_id} if machine_id else {}
    orders = await db.maintenance_work_orders.find(q).to_list(1000)
    by_status = defaultdict(int)
    for o in orders:
        by_status[o["status"]] += 1
    rows = [{"work_order": o.get("wo_id"), "machine": o["machine_label"], "issue": o.get("issue_type"),
             "work_type": o.get("work_type"), "component": o.get("component"), "technician": o.get("assigned_technician"),
             "status": o["status"], "priority": o["priority"], "created_at": o["created_at"]} for o in orders]
    kpis = [{"label": "Total Work Orders", "value": len(orders)},
            {"label": "Closed", "value": by_status.get("Closed", 0)},
            {"label": "Pending Review", "value": by_status.get("Pending Supervisor Review", 0)},
            {"label": "Waiting for Parts", "value": by_status.get("Waiting for Parts", 0)}]
    return kpis, ["work_order", "machine", "issue", "work_type", "component", "technician", "status", "priority", "created_at"], rows


async def report_machine_downtime(date_from, date_to, machine_id):
    q = {"work_type": {"$in": ["Breakdown", "Emergency Visit"]}}
    if machine_id:
        q["machine_id"] = machine_id
    orders = await db.maintenance_work_orders.find(q).to_list(1000)
    rows = []
    for o in orders:
        start = datetime.fromisoformat(o["created_at"])
        end = datetime.fromisoformat(o["closed_at"]) if o.get("closed_at") else datetime.now(timezone.utc)
        hours = round((end - start).total_seconds() / 3600, 1)
        rows.append({"work_order": o.get("wo_id"), "machine": o["machine_label"], "issue": o.get("issue_type"),
                     "status": o["status"], "downtime_hours": hours})
    kpis = [{"label": "Total Downtime (hrs)", "value": round(sum(r["downtime_hours"] for r in rows), 1)},
            {"label": "Breakdown Events", "value": len(rows)}]
    return kpis, ["work_order", "machine", "issue", "status", "downtime_hours"], rows


async def report_fault_frequency(date_from, date_to, machine_id):
    q = {"machine_id": machine_id} if machine_id else {}
    alerts = await db.technical_alerts.find(q).to_list(1000)
    counter = defaultdict(int)
    for a in alerts:
        counter[(a["machine_label"], a["alert_type"])] += 1
    rows = [{"machine": k[0], "fault": k[1], "occurrences": v} for k, v in sorted(counter.items(), key=lambda x: -x[1])]
    kpis = [{"label": "Total Faults", "value": len(alerts)}, {"label": "Distinct Fault Types", "value": len({a['alert_type'] for a in alerts})}]
    return kpis, ["machine", "fault", "occurrences"], rows


async def report_pm_compliance(date_from, date_to, machine_id):
    q = {"machine_id": machine_id} if machine_id else {}
    items = await db.preventive_maintenance_schedules.find(q).to_list(200)
    overdue = len([i for i in items if i.get("status") == "Overdue"])
    completed = len([i for i in items if i.get("status") == "Completed"])
    rows = [{"pm": i.get("pm_id"), "machine": i["machine_label"], "pm_type": i.get("pm_type"),
             "frequency": i.get("frequency"), "technician": i.get("technician"), "due_at": i.get("due_at"),
             "status": i.get("status"), "last_completed": i.get("last_completed_at")} for i in items]
    kpis = [{"label": "Total Schedules", "value": len(items)}, {"label": "Overdue", "value": overdue},
            {"label": "Completed", "value": completed},
            {"label": "Compliance %", "value": round((len(items) - overdue) / len(items) * 100, 1) if items else 0}]
    return kpis, ["pm", "machine", "pm_type", "frequency", "technician", "due_at", "status", "last_completed"], rows


async def report_calibration_report(date_from, date_to, machine_id):
    q = {"machine_id": machine_id} if machine_id else {}
    items = await db.calibration_records.find(q).sort("created_at", -1).to_list(1000)
    rows = [{"calibration": c.get("cal_id"), "machine": c["machine_label"], "slot": c.get("slot_id"),
             "bin_id": c.get("bin_id"), "item": c.get("item"), "type": c.get("calibration_type"),
             "expected": c.get("expected_quantity"), "actual": c.get("actual_quantity"), "unit": c.get("unit"),
             "variance_pct": c.get("variance_pct"), "result": c.get("result"), "technician": c.get("technician"),
             "date": c.get("created_at")} for c in items]
    failed = len([r for r in rows if r["result"] == "FAIL"])
    kpis = [{"label": "Calibrations", "value": len(rows)}, {"label": "Failed", "value": failed},
            {"label": "Pass %", "value": round((len(rows) - failed) / len(rows) * 100, 1) if rows else 0}]
    return kpis, ["calibration", "machine", "slot", "bin_id", "item", "type", "expected", "actual", "unit",
                  "variance_pct", "result", "technician", "date"], rows


async def report_technician_productivity(date_from, date_to, machine_id):
    technicians = await db.users.find({"role": "maintenance_technician"}).to_list(50)
    rows = []
    for t in technicians:
        closed = await db.maintenance_work_orders.count_documents({"assigned_technician": t["username"], "status": "Closed"})
        active = await db.maintenance_work_orders.count_documents({"assigned_technician": t["username"], "status": {"$nin": ["Closed"]}})
        cals = await db.calibration_records.count_documents({"technician": t["username"]})
        parts = await db.spare_parts_usage.count_documents({"technician": t["username"]})
        rows.append({"technician": t["username"], "name": t.get("name"), "closed_work_orders": closed,
                     "active_work_orders": active, "calibrations": cals, "parts_replaced": parts})
    kpis = [{"label": "Technicians", "value": len(rows)},
            {"label": "Total Closed", "value": sum(r["closed_work_orders"] for r in rows)}]
    return kpis, ["technician", "name", "closed_work_orders", "active_work_orders", "calibrations", "parts_replaced"], rows


async def report_spare_parts_usage(date_from, date_to, machine_id):
    q = {"machine_id": machine_id} if machine_id else {}
    usage = await db.spare_parts_usage.find(q).sort("created_at", -1).to_list(1000)
    rows = [{"part_code": u.get("part_code"), "part_name": u["part_name"], "machine": u["machine_label"],
             "work_order": u.get("work_order_ref"), "component": u.get("component"), "quantity": u["quantity"],
             "technician": u.get("technician"), "date": u.get("created_at")} for u in usage]
    kpis = [{"label": "Replacements", "value": len(rows)},
            {"label": "Units Consumed", "value": sum(r["quantity"] for r in rows)}]
    return kpis, ["part_code", "part_name", "machine", "work_order", "component", "quantity", "technician", "date"], rows


async def report_repeated_failure(date_from, date_to, machine_id):
    q = {"work_type": {"$in": ["Breakdown", "Emergency Visit"]}}
    if machine_id:
        q["machine_id"] = machine_id
    orders = await db.maintenance_work_orders.find(q).to_list(1000)
    counter = defaultdict(int)
    for o in orders:
        counter[(o["machine_label"], o.get("component") or "Other", o.get("issue_type"))] += 1
    rows = [{"machine": k[0], "component": k[1], "issue": k[2], "occurrences": v}
            for k, v in sorted(counter.items(), key=lambda x: -x[1])]
    kpis = [{"label": "Repeated Issues (>1x)", "value": len([r for r in rows if r["occurrences"] > 1])}]
    return kpis, ["machine", "component", "issue", "occurrences"], rows


async def report_component_failure(date_from, date_to, machine_id):
    q = {"machine_id": machine_id} if machine_id else {}
    orders = await db.maintenance_work_orders.find(q).to_list(1000)
    diags = await db.machine_diagnostics.find(q).to_list(500)
    counter = defaultdict(lambda: {"work_orders": 0, "failed_checks": 0})
    for o in orders:
        if o.get("component"):
            counter[o["component"]]["work_orders"] += 1
    for d in diags:
        for item in d.get("items", []):
            if item.get("status") == "Fail":
                counter[item["component"]]["failed_checks"] += 1
    rows = [{"component": k, "work_orders": v["work_orders"], "failed_diagnostics": v["failed_checks"],
             "total_events": v["work_orders"] + v["failed_checks"]}
            for k, v in sorted(counter.items(), key=lambda x: -(x[1]["work_orders"] + x[1]["failed_checks"]))]
    kpis = [{"label": "Components With Failures", "value": len(rows)},
            {"label": "Total Failure Events", "value": sum(r["total_events"] for r in rows)}]
    return kpis, ["component", "work_orders", "failed_diagnostics", "total_events"], rows


async def report_machine_health_score(date_from, date_to, machine_id):
    q = {"machine_id": machine_id} if machine_id else {}
    items = await db.machine_health_logs.find(q).to_list(50)
    rows = [{"machine": i["machine_label"], "health_score": i["health_score"],
             "health_status": i.get("health_status"), "active_alerts": i.get("active_alerts", 0),
             "open_work_orders": i.get("open_work_orders", 0), "overdue_pm": i.get("overdue_pm", 0),
             "downtime_minutes": i.get("downtime_minutes", 0)} for i in items]
    kpis = [{"label": "Avg Health Score", "value": round(sum(r["health_score"] for r in rows) / len(rows), 1) if rows else 0},
            {"label": "Machines Down", "value": len([r for r in rows if r["health_status"] == "Down"])}]
    return kpis, ["machine", "health_score", "health_status", "active_alerts", "open_work_orders", "overdue_pm", "downtime_minutes"], rows


async def report_repair_turnaround(date_from, date_to, machine_id):
    q = {"status": "Closed"}
    if machine_id:
        q["machine_id"] = machine_id
    orders = await db.maintenance_work_orders.find(q).to_list(1000)
    rows = []
    for o in orders:
        if not o.get("closed_at"):
            continue
        start = datetime.fromisoformat(o["created_at"])
        end = datetime.fromisoformat(o["closed_at"])
        hours = round((end - start).total_seconds() / 3600, 1)
        rows.append({"work_order": o.get("wo_id"), "machine": o["machine_label"], "issue": o.get("issue_type"),
                     "technician": o.get("assigned_technician"), "turnaround_hours": hours})
    kpis = [{"label": "Avg Turnaround (hrs)", "value": round(sum(r["turnaround_hours"] for r in rows) / len(rows), 1) if rows else 0},
            {"label": "Closed Work Orders", "value": len(rows)}]
    return kpis, ["work_order", "machine", "issue", "technician", "turnaround_hours"], rows


async def report_mttr(date_from, date_to, machine_id):
    q = {"status": "Closed", "work_type": {"$in": ["Breakdown", "Emergency Visit"]}}
    if machine_id:
        q["machine_id"] = machine_id
    orders = await db.maintenance_work_orders.find(q).to_list(1000)
    by_machine = defaultdict(list)
    for o in orders:
        if not o.get("closed_at"):
            continue
        hours = (datetime.fromisoformat(o["closed_at"]) - datetime.fromisoformat(o["created_at"])).total_seconds() / 3600
        by_machine[o["machine_label"]].append(hours)
    rows = [{"machine": k, "repairs": len(v), "mttr_hours": round(sum(v) / len(v), 1)} for k, v in sorted(by_machine.items())]
    overall = [h for v in by_machine.values() for h in v]
    kpis = [{"label": "Fleet MTTR (hrs)", "value": round(sum(overall) / len(overall), 1) if overall else 0},
            {"label": "Repairs Analysed", "value": len(overall)}]
    return kpis, ["machine", "repairs", "mttr_hours"], rows


REGISTRY = {
    "sales": report_sales, "machine_sales": report_machine_sales, "ingredient_consumption": report_ingredient_consumption,
    "low_stock": report_low_stock, "bin_replacement": report_bin_replacement, "staff_productivity": report_staff_productivity,
    "cleaning_compliance": report_cleaning_compliance, "dirty_bin_lifecycle": report_dirty_bin_lifecycle, "user_activity": report_user_activity,
    "work_order_summary": report_work_order_summary, "machine_downtime": report_machine_downtime, "pm_compliance": report_pm_compliance,
    "technician_productivity": report_technician_productivity, "spare_parts_usage": report_spare_parts_usage,
    "repeated_failure": report_repeated_failure, "machine_health_score": report_machine_health_score, "repair_turnaround": report_repair_turnaround,
    "fault_frequency": report_fault_frequency, "calibration_report": report_calibration_report,
    "component_failure": report_component_failure, "mttr": report_mttr,
}


def _apply_row_filters(rows, technician=None, component=None, priority=None, status=None):
    filters = {"technician": technician, "component": component, "priority": priority, "status": status}
    active = {k: v for k, v in filters.items() if v}
    if not active:
        return rows
    out = []
    for r in rows:
        if all(str(r.get(k, "")).lower() == str(v).lower() for k, v in active.items() if k in r):
            out.append(r)
    return out


@router.get("/{report_key}")
async def get_report(report_key: str, date_from: Optional[str] = None, date_to: Optional[str] = None,
                      machine_id: Optional[str] = None, technician: Optional[str] = None,
                      component: Optional[str] = None, priority: Optional[str] = None,
                      status: Optional[str] = None, user: dict = Depends(get_current_user)):
    fn = REGISTRY.get(report_key)
    if not fn:
        raise HTTPException(status_code=404, detail="Unknown report")
    kpis, columns, rows = await fn(date_from, date_to, machine_id)
    rows = _apply_row_filters(rows, technician, component, priority, status)
    return {"report_key": report_key, "kpis": kpis, "columns": columns, "rows": rows}


@router.get("/{report_key}/export")
async def export_report(report_key: str, date_from: Optional[str] = None, date_to: Optional[str] = None,
                         machine_id: Optional[str] = None, technician: Optional[str] = None,
                         component: Optional[str] = None, priority: Optional[str] = None,
                         status: Optional[str] = None, user: dict = Depends(get_current_user)):
    fn = REGISTRY.get(report_key)
    if not fn:
        raise HTTPException(status_code=404, detail="Unknown report")
    _, columns, rows = await fn(date_from, date_to, machine_id)
    rows = _apply_row_filters(rows, technician, component, priority, status)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=columns)
    writer.writeheader()
    for r in rows:
        writer.writerow({c: r.get(c, "") for c in columns})
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                              headers={"Content-Disposition": f"attachment; filename={report_key}.csv"})
