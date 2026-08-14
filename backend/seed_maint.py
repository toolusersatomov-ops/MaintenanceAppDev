"""Rich, idempotent mock data for the Maintenance Technician / Supervisor modules.
Reuses shared master data: machine IDs + locations, slot codes, standardized bin IDs,
ingredient names and units already seeded by seed.py.
"""
from datetime import datetime, timezone, timedelta

from database import db
from auth_utils import new_id, now_iso
from seed_constants import machine_label, MACHINES
from maint_constants import SPARE_PARTS_CATALOG, PM_CHECKLIST, ALERT_TYPE_MASTER, DIAGNOSTIC_CHECKS
from maint_core import next_seq, recalc_all_health, refresh_pm_statuses
from utils import push_notification


def iso(days=0, hours=0, minutes=0):
    return (datetime.now(timezone.utc) + timedelta(days=days, hours=hours, minutes=minutes)).isoformat()


def hist(*pairs):
    return [{"stage": s, "at": at, "by": by} for s, at, by in pairs]


async def slot_ref(machine_id, code):
    slot = await db.machine_slots.find_one({"id": f"{machine_id}-{code}"})
    if not slot:
        return {"slot_id": code, "bin_id": None, "item": code, "unit": "ml"}
    return {"slot_id": slot["slot_code"], "bin_id": slot.get("current_bin_id"),
            "item": slot["ingredient_name"], "unit": slot["unit"]}


async def seed_spare_parts():
    if await db.spare_parts_inventory.count_documents({}) == 0:
        for p in SPARE_PARTS_CATALOG:
            await db.spare_parts_inventory.insert_one({
                "id": new_id(), "part_code": p["part_code"], "part_name": p["name"], "name": p["name"],
                "category": p["category"], "total_stock": p["total_stock"], "assigned_qty": 0,
                "min_stock": p["min_stock"], "unit_cost": p["unit_cost"], "unit": "pcs",
            })
    if await db.technician_parts.count_documents({}) == 0:
        allocation = {
            "tech01": [("SP-PMP-002", 3, 1), ("SP-SOL-003", 4, 2), ("SP-NOZ-004", 5, 1), ("SP-TMP-009", 2, 0)],
            "tech02": [("SP-SEN-012", 3, 1), ("SP-DOR-005", 2, 0), ("SP-CUP-008", 4, 2)],
            "tech03": [("SP-BLD-010", 2, 0), ("SP-LDC-013", 3, 1), ("SP-GRP-014", 1, 0)],
        }
        code_name = {p["part_code"]: p["name"] for p in SPARE_PARTS_CATALOG}
        for tech, parts in allocation.items():
            for code, assigned, used in parts:
                await db.technician_parts.insert_one({
                    "id": new_id(), "technician": tech, "part_code": code, "part_name": code_name[code],
                    "assigned_qty": assigned, "used_qty": used, "available_qty": assigned - used,
                    "min_qty": 1, "last_used_machine": "M002" if used else None,
                    "last_used_machine_label": machine_label("M002") if used else None,
                    "last_used_work_order": None, "last_used_at": iso(days=-4) if used else None,
                })
                await db.spare_parts_inventory.update_one({"part_code": code}, {"$inc": {"assigned_qty": assigned - used}})


ALERT_SEED = [
    # (machine, alert_type, severity, age_days, status)
    ("M001", "Pump Failure", "High", 0, "Open"),
    ("M004", "Machine Down", "Critical", 0, "Open"),
    ("M002", "Blender Failure", "High", 1, "Work Order Created"),
    ("M003", "Door Sensor Failure", "Medium", 2, "Work Order Created"),
    ("M005", "Display Failure", "Medium", 1, "Work Order Created"),
    ("M002", "Temperature Fault", "High", 3, "Open"),
    ("M003", "Connectivity Failure", "High", 0, "Open"),
    ("M005", "Cup Dispenser Failure", "Medium", 4, "Open"),
    ("M001", "PM Due", "Low", 1, "Open"),
    ("M002", "PM Overdue", "High", 2, "Open"),
    ("M004", "Repeated Failure", "High", 5, "Open"),
    ("M003", "Calibration Failure", "High", 1, "Open"),
    ("M001", "Lid Dispenser Failure", "Low", 6, "Resolved"),
    ("M005", "Payment Device Failure", "High", 8, "Resolved"),
]


async def seed_technical_alerts():
    if await db.technical_alerts.count_documents({}) > 0:
        return {}
    created = {}
    for machine_id, alert_type, severity, age, status in ALERT_SEED:
        component, error_code, _sev, suggested = ALERT_TYPE_MASTER[alert_type]
        doc = {
            "id": new_id(), "alert_id": await next_seq("TA"), "machine_id": machine_id,
            "machine_label": machine_label(machine_id), "alert_type": alert_type, "component": component,
            "error_code": error_code, "severity": severity, "suggested_action": suggested,
            "detail": f"{alert_type} reported by machine telemetry on {machine_label(machine_id)}.",
            "status": status, "created_at": iso(days=-age), "work_order_id": None, "work_order_ref": None,
            "acknowledged_by": "maintenance_sup01" if status == "Resolved" else None,
            "resolution_note": "Resolved and closed after repair." if status == "Resolved" else None,
        }
        await db.technical_alerts.insert_one(doc)
        created[(machine_id, alert_type)] = doc
    return created


async def _insert_wo(**kw):
    doc = {
        "id": new_id(), "wo_id": await next_seq("WO"), "parts_used": [], "repair": None, "review": None,
        "flagged": False, "flag": None, "qr_verified": False, "supervisor_comment": None,
        "technician_comment": None, "technical_alert_id": None, "technical_alert_ref": None,
        "created_by": "maintenance_sup01", "assigned_by": "maintenance_sup01", "closed_at": None,
        "updated_at": now_iso(), **kw,
    }
    doc["machine_label"] = machine_label(doc["machine_id"])
    await db.maintenance_work_orders.insert_one(doc)
    return doc


async def seed_work_orders(alerts):
    if await db.maintenance_work_orders.count_documents({}) > 0:
        return
    sup = "maintenance_sup01"

    def link(machine_id, alert_type):
        a = alerts.get((machine_id, alert_type))
        return ({"technical_alert_id": a["id"], "technical_alert_ref": a["alert_id"]} if a else {})

    # 1. M002 Blender Failure — tech01, repair in progress, diagnostics recorded
    wo1 = await _insert_wo(
        machine_id="M002", work_type="Breakdown", issue_type="Blender Failure", component="Blender",
        error_code="E-BLD-08", description="Blender stalls mid-cycle and trips overload protection.",
        priority="High", assigned_technician="tech01", assigned_at=iso(days=-1),
        start_at=iso(days=-1), due_at=iso(hours=4), status="Repair In Progress", qr_verified=True,
        qr_verified_at=iso(days=-1, hours=1), repair_started_at=iso(hours=-3),
        created_at=iso(days=-1), technician_comment="Blade set worn, coupling replaced.",
        history=hist(("Technical Alert Created", iso(days=-1), "system"), ("Work Order Created", iso(days=-1), sup),
                     ("Technician Assigned", iso(days=-1), sup), ("Technician Accepted", iso(days=-1, hours=1), "tech01"),
                     ("In Transit", iso(hours=-6), "tech01"), ("Reached Machine", iso(hours=-5), "tech01"),
                     ("Machine QR Verified", iso(hours=-5), "tech01"), ("Diagnosis Started", iso(hours=-4), "tech01"),
                     ("Diagnosis Completed", iso(hours=-4), "tech01"), ("Repair Started", iso(hours=-3), "tech01")),
        **link("M002", "Blender Failure"))
    await db.technical_alerts.update_one({"id": wo1.get("technical_alert_id")}, {"$set": {"work_order_id": wo1["id"], "work_order_ref": wo1["wo_id"]}})

    items = []
    for component, cid, expected, ec in DIAGNOSTIC_CHECKS[:12]:
        status = "Fail" if component == "Blender" else ("Warning" if component == "Motors" else "Pass")
        items.append({"component": component, "component_id": cid, "reading": "Within range" if status == "Pass" else "Out of range",
                       "expected": expected, "status": status, "error_code": ec if status != "Pass" else None,
                       "comment": "Blade set worn out, RPM at 12000 against 18000 expected." if status == "Fail" else None,
                       "photo": None})
    await db.machine_diagnostics.insert_one({
        "id": new_id(), "diag_id": await next_seq("DG"), "machine_id": "M002", "machine_label": machine_label("M002"),
        "work_order_id": wo1["id"], "work_order_ref": wo1["wo_id"], "technician": "tech01", "items": items,
        "summary": {"Pass": 10, "Warning": 1, "Fail": 1}, "overall_result": "Fail", "created_at": iso(hours=-4),
    })

    # 2. M003 Door Sensor Failure — tech02, waiting for parts + pending part request
    wo2 = await _insert_wo(
        machine_id="M003", work_type="Breakdown", issue_type="Door Sensor Failure", component="Sensor",
        error_code="E-DRS-12", description="Right door sensor intermittently reports open while closed.",
        priority="Medium", assigned_technician="tech02", assigned_at=iso(days=-2), start_at=iso(days=-2),
        due_at=iso(hours=-2), status="Waiting for Parts", qr_verified=True, qr_verified_at=iso(days=-2),
        created_at=iso(days=-2), flagged=True,
        flag={"reason": "Need Part From Warehouse", "comment": "Door sensor faulty, replacement sensor not in my kit.",
               "at": iso(days=-1), "by": "tech02"},
        history=hist(("Technical Alert Created", iso(days=-2), "system"), ("Work Order Created", iso(days=-2), sup),
                     ("Technician Assigned", iso(days=-2), sup), ("Technician Accepted", iso(days=-2), "tech02"),
                     ("In Transit", iso(days=-2), "tech02"), ("Reached Machine", iso(days=-2), "tech02"),
                     ("Machine QR Verified", iso(days=-2), "tech02"), ("Diagnosis Started", iso(days=-2), "tech02"),
                     ("Diagnosis Completed", iso(days=-2), "tech02"), ("Repair Started", iso(days=-1), "tech02"),
                     ("Waiting for Parts", iso(days=-1), "tech02")),
        **link("M003", "Door Sensor Failure"))
    await db.technical_alerts.update_one({"id": wo2.get("technical_alert_id")}, {"$set": {"work_order_id": wo2["id"], "work_order_ref": wo2["wo_id"]}})
    await db.spare_parts_requests.insert_one({
        "id": new_id(), "req_id": await next_seq("SPR"), "technician": "tech02", "part_code": "SP-SEN-012",
        "part_name": "Door Sensor", "quantity": 1, "work_order_id": wo2["id"], "work_order_ref": wo2["wo_id"],
        "machine_id": "M003", "machine_label": machine_label("M003"),
        "reason": "Existing sensor faulty, needs replacement", "priority": "High",
        "comment": "Required today to close the work order.", "status": "Requested",
        "requested_at": iso(days=-1), "supervisor_comment": None,
    })
    await db.escalations.insert_one({
        "id": new_id(), "esc_id": await next_seq("ESC"), "work_order_id": wo2["id"], "work_order_ref": wo2["wo_id"],
        "machine_id": "M003", "machine_label": machine_label("M003"), "issue": "Door Sensor Failure",
        "technician": "tech02", "reason": "Part Unavailable", "flag_reason": "Need Part From Warehouse",
        "comment": "Door sensor faulty, replacement sensor not in my kit.", "priority": "High",
        "raised_by": "tech02", "created_at": iso(days=-1), "status": "Open", "comments": [],
    })

    # 3. M005 Display Failure — tech03, pending supervisor review (full evidence)
    wo3 = await _insert_wo(
        machine_id="M005", work_type="Breakdown", issue_type="Display Failure", component="Display",
        error_code="E-DSP-14", description="Touchscreen unresponsive on lower third of the panel.",
        priority="High", assigned_technician="tech03", assigned_at=iso(days=-1), start_at=iso(days=-1),
        due_at=iso(hours=6), status="Pending Supervisor Review", qr_verified=True, qr_verified_at=iso(days=-1),
        created_at=iso(days=-1), submitted_at=iso(hours=-1), technician_comment="Panel replaced and tested OK.",
        repair={"issue": "Display Failure", "error_code": "E-DSP-14", "failed_component": "Display",
                 "diagnosis_summary": "Touch digitizer failure on lower third of panel.",
                 "root_cause": "Moisture ingress damaged the digitizer ribbon.",
                 "repair_action": "Replaced touchscreen panel and resealed the bezel.",
                 "parts_used": "Touchscreen Panel x1", "before_photo": "mock://display-before.jpg",
                 "after_photo": "mock://display-after.jpg", "testing_result": "Pass \u2013 all touch zones responsive",
                 "comment": "Recommend bezel gasket check in next PM.", "recorded_by": "tech03",
                 "recorded_at": iso(hours=-2), "repair_start_time": iso(hours=-5), "repair_end_time": iso(hours=-2)},
        parts_used=[{"part_code": "SP-DSP-006", "part_name": "Touchscreen Panel", "quantity": 1, "at": iso(hours=-3)}],
        history=hist(("Technical Alert Created", iso(days=-1), "system"), ("Work Order Created", iso(days=-1), sup),
                     ("Technician Assigned", iso(days=-1), sup), ("Technician Accepted", iso(days=-1), "tech03"),
                     ("In Transit", iso(hours=-7), "tech03"), ("Reached Machine", iso(hours=-6), "tech03"),
                     ("Machine QR Verified", iso(hours=-6), "tech03"), ("Diagnosis Started", iso(hours=-6), "tech03"),
                     ("Diagnosis Completed", iso(hours=-5), "tech03"), ("Repair Started", iso(hours=-5), "tech03"),
                     ("Part Issued", iso(hours=-4), sup), ("Repair Completed", iso(hours=-2), "tech03"),
                     ("Calibration / Testing", iso(hours=-2), "tech03"),
                     ("Submitted for Supervisor Review", iso(hours=-1), "tech03")),
        **link("M005", "Display Failure"))
    await db.technical_alerts.update_one({"id": wo3.get("technical_alert_id")}, {"$set": {"work_order_id": wo3["id"], "work_order_ref": wo3["wo_id"]}})
    await db.spare_parts_usage.insert_one({
        "id": new_id(), "work_order_id": wo3["id"], "work_order_ref": wo3["wo_id"], "machine_id": "M005",
        "machine_label": machine_label("M005"), "component": "Display", "part_code": "SP-DSP-006",
        "old_part_code": "SP-DSP-006", "new_part_code": "SP-DSP-006", "part_name": "Touchscreen Panel",
        "serial_number": "TS-2291-A", "quantity": 1, "reason": "Physical Damage", "technician": "tech03",
        "testing_result": "Pass", "comment": "Panel replaced under warranty stock.", "created_at": iso(hours=-3),
    })
    for component, command, result in [("Display", "Touch Test", "Pass"), ("Payment Device", "Test Transaction", "Pass"),
                                        ("Camera / QR Scanner", "Read Test QR", "Pass")]:
        await db.component_tests.insert_one({
            "id": new_id(), "machine_id": "M005", "machine_label": machine_label("M005"),
            "work_order_id": wo3["id"], "component": component, "command": command, "result": result,
            "reading": "OK", "comment": None, "technician": "tech03", "created_at": iso(hours=-2),
        })

    # 4. M004 Machine Down — critical, assigned to tech01, not yet accepted
    wo4 = await _insert_wo(
        machine_id="M004", work_type="Emergency Visit", issue_type="Machine Down", component="Controller",
        error_code="E-CTRL-00", description="Machine not responding, controller watchdog reboot loop.",
        priority="Critical", assigned_technician="tech01", assigned_at=iso(hours=-1), start_at=iso(hours=-1),
        due_at=iso(hours=3), status="Assigned", created_at=iso(hours=-1),
        history=hist(("Technical Alert Created", iso(hours=-1), "system"), ("Work Order Created", iso(hours=-1), sup),
                     ("Technician Assigned", iso(hours=-1), sup)),
        **link("M004", "Machine Down"))
    await db.technical_alerts.update_one({"id": wo4.get("technical_alert_id")}, {"$set": {
        "status": "Work Order Created", "work_order_id": wo4["id"], "work_order_ref": wo4["wo_id"]}})

    # 5. Closed PM work order on M001 (8 days ago) with service history
    wo5 = await _insert_wo(
        machine_id="M001", work_type="Preventive Maintenance", issue_type="Routine PM (Quarterly)",
        component="Other", error_code="E-PM-23", description="Standard 31-Point PM Checklist",
        priority="Low", assigned_technician="tech01", assigned_at=iso(days=-10), start_at=iso(days=-10),
        due_at=iso(days=-8), status="Closed", qr_verified=True, created_at=iso(days=-10),
        completed_at=iso(days=-8), closed_at=iso(days=-8),
        review={"decision": "Approved and Closed", "by": sup, "at": iso(days=-8), "comment": "PM completed satisfactorily."},
        history=hist(("Work Order Created", iso(days=-10), sup), ("Technician Assigned", iso(days=-10), sup),
                     ("Technician Accepted", iso(days=-10), "tech01"), ("Machine QR Verified", iso(days=-9), "tech01"),
                     ("Calibration / Testing", iso(days=-9), "tech01"),
                     ("Submitted for Supervisor Review", iso(days=-8), "tech01"),
                     ("Supervisor Reviewed", iso(days=-8), sup), ("Closed", iso(days=-8), sup)))

    # 6. Closed breakdown on M004 (repeated failure history) — pump replaced twice before
    for age, comp in [(20, "Pump"), (12, "Pump")]:
        await _insert_wo(
            machine_id="M004", work_type="Breakdown", issue_type="Pump Failure", component=comp,
            error_code="E-PUMP-05", description="Liquid line L4 pump not priming.", priority="High",
            assigned_technician="tech02", assigned_at=iso(days=-age), start_at=iso(days=-age),
            due_at=iso(days=-age), status="Closed", qr_verified=True, created_at=iso(days=-age),
            completed_at=iso(days=-age + 1), closed_at=iso(days=-age + 1),
            repair={"failed_component": "Pump", "diagnosis_summary": "Pump head worn, no suction.",
                     "root_cause": "Tube fatigue", "repair_action": "Replaced peristaltic pump",
                     "testing_result": "Pass", "before_photo": "mock://pump-before.jpg",
                     "after_photo": "mock://pump-after.jpg", "recorded_by": "tech02"},
            review={"decision": "Approved and Closed", "by": sup, "at": iso(days=-age + 1), "comment": "Closed."},
            history=hist(("Work Order Created", iso(days=-age), sup), ("Technician Assigned", iso(days=-age), sup),
                         ("Repair Completed", iso(days=-age + 1), "tech02"), ("Closed", iso(days=-age + 1), sup)))

    for wo, tech in [(wo5, "tech01")]:
        await db.service_history.insert_one({
            "id": new_id(), "machine_id": wo["machine_id"], "machine_label": wo["machine_label"],
            "work_order_id": wo["id"], "work_order_ref": wo["wo_id"], "date": wo["closed_at"],
            "issue": wo["issue_type"], "component": wo["component"], "error_code": wo["error_code"],
            "diagnosis": "All 31 checkpoints inspected", "repair": "Lubrication, filter clean, gasket check",
            "parts_used": [], "calibration_performed": ["Liquid Volume Calibration (PASS)"],
            "test_result": "Pass", "downtime_minutes": 95, "technician": tech,
            "supervisor_review": "Approved by maintenance_sup01", "final_status": "Closed",
        })

    await push_notification(target_username="tech01", title="New Work Order Assigned",
                             message=f"{wo4['wo_id']} \u00b7 Machine Down on {machine_label('M004')} (Critical)",
                             link="/technician/work-orders")
    await push_notification(target_role="maintenance_supervisor", title="Pending Supervisor Review",
                             message=f"{wo3['wo_id']} \u00b7 {machine_label('M005')} submitted by tech03",
                             link="/maintenance-supervisor/work-orders")
    await push_notification(target_role="maintenance_supervisor", title="Spare Part Request",
                             message=f"tech02 requested 1x Door Sensor for {machine_label('M003')}",
                             link="/maintenance-supervisor/spare-parts-approvals")


PM_SEED = [
    ("M001", "Routine PM", "Quarterly", 2, "Scheduled", "tech01"),
    ("M002", "Deep Service PM", "Monthly", -4, "Overdue", "tech01"),
    ("M003", "Refrigeration PM", "Quarterly", 12, "Scheduled", "tech02"),
    ("M004", "Dispensing System PM", "Monthly", 1, "Due", "tech02"),
    ("M005", "Safety PM", "Quarterly", 25, "Scheduled", "tech03"),
]


async def seed_pm():
    if await db.preventive_maintenance_schedules.count_documents({}) > 0:
        return
    for machine_id, pm_type, frequency, due_in, status, tech in PM_SEED:
        steps = [{"step": s, "requires_photo": p, "status": "Not Started", "comment": None,
                   "before_photo": None, "after_photo": None, "completed_at": None} for s, p in PM_CHECKLIST]
        await db.preventive_maintenance_schedules.insert_one({
            "id": new_id(), "pm_id": await next_seq("PM"), "machine_id": machine_id,
            "machine_label": machine_label(machine_id), "pm_type": pm_type, "frequency": frequency,
            "scheduled_at": iso(days=due_in - 2), "due_at": iso(days=due_in), "technician": tech,
            "priority": "High" if status == "Overdue" else "Medium",
            "checklist_template": "Standard 31-Point PM Checklist",
            "comment": "Auto-scheduled preventive maintenance cycle.", "status": status, "steps": steps,
            "work_order_id": None, "work_order_ref": None, "created_by": "maintenance_sup01",
            "created_at": iso(days=-5), "last_completed_at": iso(days=-92), "next_due_at": None,
        })
    await refresh_pm_statuses()


CAL_SEED = [
    # (machine, slot code, calibration type, expected, actual, age_days, tech)
    ("M001", "L2", "Liquid Volume Calibration", 150.0, 152.0, 3, "tech01"),
    ("M001", "P1", "Powder Weight Calibration", 20.0, 19.6, 3, "tech01"),
    ("M002", "L4", "Liquid Time-Based Calibration (Pump / Line)", 100.0, 88.0, 2, "tech01"),
    ("M003", "S3", "Solid Weight Calibration", 100.0, 101.5, 5, "tech02"),
    ("M003", "ICE", "Ice Weight Calibration", 210.0, 190.0, 1, "tech02"),
    ("M004", "L1", "Liquid Volume Calibration", 240.0, 238.0, 7, "tech02"),
    ("M005", "P2", "Powder Weight Calibration", 10.0, 10.2, 4, "tech03"),
    ("M005", "S8", "Load Cell 100 g Reference Check", 100.0, 99.4, 4, "tech03"),
]


async def seed_calibrations():
    if await db.calibration_records.count_documents({}) > 0:
        return
    for machine_id, code, cal_type, expected, actual, age, tech in CAL_SEED:
        ref = await slot_ref(machine_id, code)
        difference = round(actual - expected, 3)
        variance = round((difference / expected) * 100, 2) if expected else 0.0
        result = "PASS" if abs(variance) <= 5 else "FAIL"
        await db.calibration_records.insert_one({
            "id": new_id(), "cal_id": await next_seq("CAL"), "machine_id": machine_id,
            "machine_label": machine_label(machine_id), "slot_id": ref["slot_id"], "bin_id": ref["bin_id"],
            "item": ref["item"], "calibration_type": cal_type, "expected_quantity": expected,
            "actual_quantity": actual, "unit": ref["unit"], "difference": difference,
            "variance_pct": variance, "result": result,
            "run_time_seconds": 12.0 if "Time-Based" in cal_type else None, "technician": tech,
            "work_order_id": None, "work_order_ref": None,
            "comment": "Outside tolerance, recalibration required." if result == "FAIL" else None,
            "created_at": iso(days=-age), "next_due": iso(days=30 - age), "recalibrated": False,
            "recalibration_required": result == "FAIL", "status": "Failed" if result == "FAIL" else "Passed",
        })


async def seed_panel_logs():
    if await db.panel_access_logs.count_documents({}) > 0:
        return
    for machine_id, panel, command, tech, age in [
        ("M002", "Right Door", "Open", "tech01", 1), ("M002", "Right Door", "Close", "tech01", 1),
        ("M003", "Service Panel", "Open", "tech02", 2), ("M005", "Back Door", "Open", "tech03", 1),
    ]:
        await db.panel_access_logs.insert_one({
            "id": new_id(), "machine_id": machine_id, "machine_label": machine_label(machine_id),
            "panel": panel, "command": command, "technician": tech, "result": "Success",
            "created_at": iso(days=-age),
        })


async def seed_maintenance_data():
    await seed_spare_parts()
    alerts = await seed_technical_alerts()
    if not alerts:
        alerts = {}
        for a in await db.technical_alerts.find().to_list(200):
            alerts[(a["machine_id"], a.get("alert_type"))] = a
    await seed_work_orders(alerts)
    await seed_pm()
    await seed_calibrations()
    await seed_panel_logs()
    await recalc_all_health()
