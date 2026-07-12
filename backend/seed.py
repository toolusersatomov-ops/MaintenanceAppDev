"""Idempotent seed script for the Protein Hulk Maintenance App.
Populates all shared mock-data collections in MongoDB so every role's
dashboards/pages have real, connected data from first login.
"""
import random
from datetime import datetime, timezone, timedelta

from database import db
from auth_utils import new_id, hash_password, now_iso
from seed_constants import (
    MACHINES, USERS_SEED, ALL_INGREDIENTS, INGREDIENT_NAME, INGREDIENT_UNIT, CATEGORY_OF,
    RECIPES, compute_max_usage, recipes_using, machine_label, SPARE_PARTS, DRINK_NAMES,
)

RNG = random.Random(42)

OTHER_CAPACITY_OVERRIDE = {"CAN": 200, "LID": 120, "WC1": 20, "WC2": 20, "SN1": 5, "WWC1": 20, "WWC2": 20, "WWC3": 20}
NO_RECIPE_DEFAULT_CAPACITY = 1000

# Deterministic "problem" slots per warning machine -> (code, issue)
PROBLEM_SLOTS = {
    "M002": [("L2", "Low Stock"), ("P1", "Near Expiry"), ("S8", "Replacement Due")],
    "M004": [("L1", "Low Stock"), ("P8", "Near Expiry"), ("S5", "Replacement Due")],
}

# Consumable demo levels (pct) so WWC/WC/Cup alert logic is demonstrable from first login
CONSUMABLE_LEVELS = {
    "M001": {"CAN": 12},                       # low cup dispenser
    "M002": {"WWC1": 40, "WWC2": 92, "WWC3": 91},  # combined waste-water replacement
    "M003": {"WC1": 10},                       # single low water can
    "M004": {"WWC1": 35, "WWC2": 90},          # waste-water awareness only
    "M005": {"WC1": 12, "WC2": 8},             # combined low water cans
}


def iso_days(delta_days):
    return (datetime.now(timezone.utc) + timedelta(days=delta_days)).isoformat()


def capacity_for(code):
    max_usage = compute_max_usage()
    if code in max_usage:
        return round(max_usage[code] * 120, 2)
    return OTHER_CAPACITY_OVERRIDE.get(code, NO_RECIPE_DEFAULT_CAPACITY)


async def seed_users():
    for u in USERS_SEED:
        existing = await db.users.find_one({"username": u["username"]})
        if existing:
            continue
        await db.users.insert_one({
            "id": new_id(),
            "username": u["username"],
            "password_hash": hash_password(u["password"]),
            "role": u["role"],
            "name": u["name"],
            "email": u.get("email"),
            "assigned_machines": u["assigned_machines"],
            "locked": False,
            "failed_attempts": 0,
            "created_at": now_iso(),
        })
    await db.users.create_index("username", unique=True)


async def seed_machines():
    for m in MACHINES:
        await db.machines.update_one({"id": m["id"]}, {
            "$set": {
                "id": m["id"], "location": m["location"], "status": m["status"],
                "label": machine_label(m["id"]), "assigned_operations_staff": m["assigned_operations_staff"],
            },
            "$setOnInsert": {
                "last_visit_time": None, "trolley_status": "Empty", "last_cleaning_date": None,
            },
        }, upsert=True)


async def seed_ingredients():
    max_usage = compute_max_usage()
    for code, name, unit in ALL_INGREDIENTS:
        refill_qty = max_usage.get(code, OTHER_CAPACITY_OVERRIDE.get(code, NO_RECIPE_DEFAULT_CAPACITY))
        await db.ingredient_master.update_one({"code": code}, {"$set": {
            "id": code, "code": code, "name": name, "unit": unit, "category": CATEGORY_OF[code],
            "max_usage_per_cup": max_usage.get(code, 0),
            "refill_quantity_120_cups": round(refill_qty * 120, 2) if code in max_usage else refill_qty,
            "recipes_using": recipes_using(code),
        }}, upsert=True)


async def seed_recipes():
    for r in RECIPES:
        await db.recipe_master.update_one({"no": r["no"]}, {"$set": {
            "id": f"DRINK-{r['no']}", "no": r["no"], "name": r["name"], "ingredients": r["ingredients"],
        }}, upsert=True)


def _bin_id(prefix, code, n=None):
    return f"BIN-{prefix}-{code}" + (f"-{n}" if n is not None else "")


async def _create_bin(bin_id, bin_type, status, current_ingredient=None, previous_ingredient=None,
                       last_used_machine=None, last_used_slot=None, location="Kitchen Storage"):
    qr = f"QR-{bin_id}"
    await db.bin_qr_master.update_one({"id": bin_id}, {"$set": {
        "id": bin_id, "bin_id": bin_id, "qr_code_id": qr, "bin_type": bin_type,
    }}, upsert=True)
    await db.bin_storage.update_one({"id": bin_id}, {"$set": {
        "id": bin_id, "qr_code_id": qr, "bin_type": bin_type, "status": status,
        "current_ingredient_code": current_ingredient, "previous_ingredient_code": previous_ingredient,
        "last_used_machine": last_used_machine, "last_used_slot": last_used_slot,
        "last_cleaned_date": iso_days(-RNG.randint(1, 5)), "location": location,
    }}, upsert=True)
    return qr


async def seed_slots_and_bins():
    existing = await db.machine_slots.count_documents({})
    if existing > 0:
        return
    for m in MACHINES:
        mid = m["id"]
        problems = dict(PROBLEM_SLOTS.get(mid, []))
        for code, name, unit in ALL_INGREDIENTS:
            slot_id = f"{mid}-{code}"
            capacity = capacity_for(code)
            issue = problems.get(code)
            bin_id = _bin_id(mid, code)
            bin_type = CATEGORY_OF[code]

            expiry_days = 30
            due_days = 14
            qty_ratio = 0.78
            status = "Normal"
            consumable_pct = CONSUMABLE_LEVELS.get(mid, {}).get(code)
            if consumable_pct is not None:
                qty_ratio = consumable_pct / 100.0
            if issue == "Low Stock":
                qty_ratio = 0.08
                status = "Low Stock"
            elif issue == "Near Expiry":
                expiry_days = 2
                status = "Near Expiry"
            elif issue == "Replacement Due":
                due_days = -1
                status = "Replacement Due"

            current_qty = round(capacity * qty_ratio, 2)

            await db.slot_qr_master.update_one({"slot_id": slot_id}, {"$set": {
                "id": slot_id, "slot_id": slot_id, "machine_id": mid, "qr_code_id": f"SLOTQR-{slot_id}",
            }}, upsert=True)

            await _create_bin(bin_id, bin_type, "Placed in Machine", current_ingredient=code,
                               last_used_machine=mid, last_used_slot=slot_id, location=mid)

            await db.machine_slots.update_one({"id": slot_id}, {"$set": {
                "id": slot_id, "machine_id": mid, "machine_label": machine_label(mid),
                "slot_code": code, "ingredient_code": code, "ingredient_name": name,
                "slot_type": bin_type, "unit": unit, "capacity": capacity,
                "current_quantity": current_qty,
                "current_level_pct": round((current_qty / capacity) * 100, 1) if capacity else 0,
                "expiry_date": iso_days(expiry_days), "replacement_due_date": iso_days(due_days),
                "status": status, "current_bin_id": bin_id, "current_bin_qr_code_id": f"QR-{bin_id}",
            }}, upsert=True)

    # Spare bin pool for Kitchen circulation (clean bins ready for filling)
    for category, count in [("Liquid", 6), ("Powder", 6), ("Solid", 6), ("Other", 4)]:
        for n in range(1, count + 1):
            bin_id = f"BIN-SPARE-{category.upper()}-{n}"
            await _create_bin(bin_id, category, "Clean / Ready for Filling", location="Kitchen Storage")


async def seed_alerts():
    existing = await db.alerts.count_documents({})
    if existing > 0:
        return
    for mid, problems in PROBLEM_SLOTS.items():
        for code, issue in problems:
            slot = await db.machine_slots.find_one({"id": f"{mid}-{code}"})
            if not slot:
                continue
            priority = "High" if issue in ("Low Stock", "Replacement Due") else "Medium"
            alert = {
                "id": new_id(),
                "alert_type": issue,
                "machine_id": mid,
                "machine_label": machine_label(mid),
                "slot_id": slot["id"],
                "slot_type": slot["slot_type"],
                "ingredient_code": code,
                "ingredient_name": slot["ingredient_name"],
                "current_quantity": slot["current_quantity"],
                "unit": slot["unit"],
                "current_level_pct": slot["current_level_pct"],
                "full_capacity": slot["capacity"],
                "expiry_date": slot["expiry_date"],
                "replacement_due_date": slot["replacement_due_date"],
                "current_bin_id": slot["current_bin_id"],
                "current_bin_qr_code_id": slot["current_bin_qr_code_id"],
                "priority": priority,
                "created_at": now_iso(),
                "recipes_affected": recipes_using(code),
                "suggested_action": f"Assign Operations Staff to replace the {slot['ingredient_name']} bin on {machine_label(mid)} and create a Kitchen Fill Ticket.",
                "status": "Open",
                "assigned_operations_staff": None,
                "bin_replacement_task_id": None,
                "pickup_task_id": None,
                "kitchen_prep_request_id": None,
            }
            await db.alerts.insert_one(alert)

    # Progress ONE alert (M002 Replacement Due S8) through the full pipeline as a live demo
    demo_alert = await db.alerts.find_one({"machine_id": "M002", "ingredient_code": "S8"})
    if demo_alert:
        await _progress_demo_alert(demo_alert)


async def _progress_demo_alert(alert):
    from utils import push_progress
    mid = alert["machine_id"]
    slot_id = alert["slot_id"]
    code = alert["ingredient_code"]

    spare_bin = await db.bin_storage.find_one({"bin_type": alert["slot_type"], "status": "Clean / Ready for Filling"})
    if not spare_bin:
        return
    brt_id = new_id()
    pt_id = new_id()
    kpr_id = new_id()
    qty = capacity_for(code)

    await db.bin_replacement_tasks.insert_one({
        "id": brt_id, "machine_id": mid, "machine_label": machine_label(mid), "slot_id": slot_id,
        "ingredient_code": code, "ingredient_name": alert["ingredient_name"], "alert_id": alert["id"],
        "assigned_operations_staff": "operations01", "old_bin_id": alert["current_bin_id"],
        "old_bin_qr_code_id": alert["current_bin_qr_code_id"], "new_bin_id": None, "new_bin_scanned": False,
        "slot_scanned": False, "old_bin_removed": False, "old_bin_scanned": False, "pickup_task_id": pt_id,
        "stage": "Ready for Pickup", "status": "Pending Pickup", "created_at": now_iso(),
    })

    await db.kitchen_preparation_requests.insert_one({
        "id": kpr_id, "machine_id": mid, "machine_label": machine_label(mid), "slot_id": slot_id,
        "ingredient_code": code, "ingredient_name": alert["ingredient_name"], "quantity": qty,
        "unit": alert["unit"], "alert_id": alert["id"], "bin_replacement_task_id": brt_id,
        "pickup_task_id": pt_id, "status": "Saved / Ready for Pickup", "created_by": "operations_sup01",
        "requested_at": now_iso(), "bin_id": spare_bin["id"],
    })

    await db.saved_bins.insert_one({
        "id": new_id(), "bin_id": spare_bin["id"], "qr_code_id": spare_bin["qr_code_id"],
        "ingredient_code": code, "ingredient_name": alert["ingredient_name"], "quantity": qty,
        "unit": alert["unit"], "expiry_date": iso_days(7), "replacement_due_date": iso_days(14),
        "status": "Saved / Ready for Pickup", "machine_id": mid, "machine_label": machine_label(mid),
        "slot_id": slot_id, "kitchen_prep_request_id": kpr_id, "pickup_task_id": pt_id,
        "created_at": now_iso(),
    })

    await db.bin_storage.update_one({"id": spare_bin["id"]}, {"$set": {
        "status": "Handed Over", "current_ingredient_code": code,
    }})

    await db.pickup_tasks.insert_one({
        "id": pt_id, "machine_id": mid, "machine_label": machine_label(mid), "slot_id": slot_id,
        "ingredient_code": code, "ingredient_name": alert["ingredient_name"], "assigned_operations_staff": "operations01",
        "kitchen_prep_request_id": kpr_id, "bin_replacement_task_id": brt_id, "bin_id": spare_bin["id"],
        "qr_code_id": spare_bin["qr_code_id"], "status": "Ready for Pickup", "created_at": now_iso(),
    })

    await db.alerts.update_one({"id": alert["id"]}, {"$set": {
        "status": "Assigned", "assigned_operations_staff": "operations01",
        "bin_replacement_task_id": brt_id, "pickup_task_id": pt_id, "kitchen_prep_request_id": kpr_id,
    }})

    for stage in ["Alert Created", "Alert Reviewed by Supervisor", "Operations Staff Assigned",
                  "Kitchen Fill Ticket Created", "Kitchen Preparation Started", "Bin QR Scanned by Kitchen",
                  "Bin Filled and Saved", "Ready for Pickup"]:
        await push_progress("alert", alert["id"], mid, stage, by="operations_sup01" if "Supervisor" in stage or "Assigned" in stage else "kitchen01")


async def seed_sales():
    if await db.sales_orders.count_documents({}) > 0:
        return
    for day_offset in range(6, -1, -1):
        day = (datetime.now(timezone.utc) - timedelta(days=day_offset)).date().isoformat()
        for m in MACHINES:
            n_orders = RNG.randint(15, 45)
            for _ in range(n_orders):
                drink = RNG.choice(RECIPES)
                await db.sales_orders.insert_one({
                    "id": new_id(), "machine_id": m["id"], "machine_label": machine_label(m["id"]),
                    "drink_no": drink["no"], "drink_name": drink["name"], "cups": 1,
                    "amount": RNG.choice([149, 179, 199, 229]), "date": day, "created_at": f"{day}T12:00:00+00:00",
                })


async def seed_maintenance():
    if await db.spare_parts_inventory.count_documents({}) == 0:
        for p in SPARE_PARTS:
            await db.spare_parts_inventory.insert_one({"id": new_id(), **p})

    if await db.technical_alerts.count_documents({}) == 0:
        alerts = [
            {"title": "Blending Motor Overheating", "machine_id": "M002", "severity": "High", "description": "Blending motor temperature exceeded safe threshold during last 3 cycles."},
            {"title": "Door Sensor Fault", "machine_id": "M004", "severity": "Medium", "description": "Right door sensor intermittently failing to confirm closed state."},
            {"title": "Nozzle Flow Irregularity", "machine_id": "M003", "severity": "Low", "description": "Dispense nozzle showing inconsistent flow rate on drink outlet."},
        ]
        tech_alert_ids = {}
        for a in alerts:
            aid = new_id()
            tech_alert_ids[a["title"]] = aid
            await db.technical_alerts.insert_one({
                "id": aid, "title": a["title"], "machine_id": a["machine_id"], "machine_label": machine_label(a["machine_id"]),
                "severity": a["severity"], "description": a["description"], "status": "Open", "created_at": now_iso(),
                "work_order_id": None,
            })

        wo1 = new_id()
        await db.maintenance_work_orders.insert_one({
            "id": wo1, "machine_id": "M002", "machine_label": machine_label("M002"), "type": "Breakdown",
            "title": "Blending Motor Overheating", "technical_alert_id": tech_alert_ids["Blending Motor Overheating"],
            "assigned_technician": "tech01", "status": "Accepted", "stage": "Accept Work Order",
            "priority": "High", "created_by": "maintenance_sup01", "created_at": now_iso(),
            "history": [{"stage": "Accept Work Order", "at": now_iso(), "by": "tech01"}],
        })
        await db.technical_alerts.update_one({"id": tech_alert_ids["Blending Motor Overheating"]}, {"$set": {"status": "Work Order Created", "work_order_id": wo1}})

        wo2 = new_id()
        await db.maintenance_work_orders.insert_one({
            "id": wo2, "machine_id": "M004", "machine_label": machine_label("M004"), "type": "Breakdown",
            "title": "Door Sensor Fault", "technical_alert_id": tech_alert_ids["Door Sensor Fault"],
            "assigned_technician": None, "status": "Open", "stage": "Awaiting Assignment",
            "priority": "Medium", "created_by": "maintenance_sup01", "created_at": now_iso(), "history": [],
        })
        await db.technical_alerts.update_one({"id": tech_alert_ids["Door Sensor Fault"]}, {"$set": {"status": "Work Order Created", "work_order_id": wo2}})

        wo3 = new_id()
        await db.maintenance_work_orders.insert_one({
            "id": wo3, "machine_id": "M001", "machine_label": machine_label("M001"), "type": "Preventive Maintenance",
            "title": "Quarterly PM Service", "technical_alert_id": None, "assigned_technician": "tech01",
            "status": "Closed", "stage": "Closed", "priority": "Low", "created_by": "maintenance_sup01",
            "created_at": iso_days(-10), "closed_at": iso_days(-8),
            "history": [{"stage": "Closed", "at": iso_days(-8), "by": "maintenance_sup01"}],
        })

        await db.spare_parts_requests.insert_one({
            "id": new_id(), "work_order_id": wo1, "machine_id": "M002", "technician": "tech01",
            "part_name": "Blending Motor", "quantity": 1, "reason": "Motor overheating, needs replacement",
            "status": "Pending Approval", "requested_at": now_iso(),
        })

        await db.escalations.insert_one({
            "id": new_id(), "work_order_id": wo2, "machine_id": "M004", "raised_by": "tech01",
            "reason": "Door sensor fault recurring for 3rd time this month, needs supervisor review",
            "status": "Open", "created_at": now_iso(),
        })

    if await db.preventive_maintenance_schedules.count_documents({}) == 0:
        for i, m in enumerate(MACHINES):
            await db.preventive_maintenance_schedules.insert_one({
                "id": new_id(), "machine_id": m["id"], "machine_label": machine_label(m["id"]),
                "checklist": ["Motor Lubrication", "Sensor Calibration", "Belt Tension Check", "Software Update Check"],
                "frequency_days": 90, "next_due_date": iso_days([-3, 10, 25, -1, 40][i]),
                "last_completed_date": iso_days(-90 + i), "status": "Overdue" if i in (0, 3) else "Scheduled",
            })

    if await db.machine_health_logs.count_documents({}) == 0:
        for m in MACHINES:
            score = 65 if m["status"] == "Warning" else RNG.randint(85, 98)
            await db.machine_health_logs.insert_one({
                "id": new_id(), "machine_id": m["id"], "machine_label": machine_label(m["id"]),
                "health_score": score, "open_technical_alerts": 1 if m["status"] == "Warning" else 0,
                "open_work_orders": 1 if m["status"] == "Warning" else 0,
                "last_breakdown_date": iso_days(-5) if m["status"] == "Warning" else None,
                "updated_at": now_iso(),
            })


async def seed_settings():
    await db.system_settings.update_one({"id": "system_settings"}, {"$set": {
        "id": "system_settings", "cups_per_refill": 120, "lockout_threshold": 5,
        "low_stock_pct": 20, "near_expiry_days": 3, "app_name": "Protein Hulk Maintenance App",
    }}, upsert=True)

    default_perms = {
        "kitchen_staff": ["Dashboard", "Preparation Requests", "Bin Filling", "Bin Storage", "Scanned Bin History", "Change Requests", "Cleaning Bins", "Notifications"],
        "operations_staff": ["Dashboard", "Assigned Machines", "Pickup List", "Bin Replacement Tasks", "Bins", "Door Control", "Cleaning & Sanitization", "Dirty Bin Return", "Replacement History", "Notifications"],
        "operations_supervisor": ["Dashboard", "Machine Control Center", "Alerts", "Pre-Schedule Tasks", "Pre-Schedule Bulk Replacements", "Task Assignment", "Live Task Progress", "Kitchen Preparation Status", "Operations Staff Tasks", "Reports", "User & Access Management"],
        "maintenance_technician": ["Dashboard", "Assigned Work Orders", "Machine Diagnostics", "Preventive Maintenance", "Breakdown Repair", "Parts Replacement", "Calibration & Testing", "Door / Panel Access", "Spare Parts Request", "Maintenance History", "Notifications"],
        "maintenance_supervisor": ["Dashboard", "Technical Alerts", "Work Orders", "Assign Technician", "Preventive Maintenance Planner", "Machine Health Center", "Technician Workload", "Spare Parts Inventory", "Spare Parts Approvals", "Maintenance Reports", "Escalations", "Notifications"],
        "admin": ["Admin Dashboard", "User & Access Management", "Role Permissions", "Machine Master", "Ingredient Master", "Recipe Master", "Maintenance Master", "Spare Parts Master", "Reports Hub", "Audit Logs", "System Settings", "Mock Data Management"],
    }
    for role, pages in default_perms.items():
        await db.role_permissions.update_one({"role": role}, {"$set": {"role": role, "pages": pages}}, upsert=True)


async def run_seed():
    from seed_demo import seed_demo_data
    await seed_users()
    await seed_machines()
    await seed_ingredients()
    await seed_recipes()
    await seed_slots_and_bins()
    await seed_alerts()
    await seed_sales()
    await seed_maintenance()
    await seed_settings()
    await seed_demo_data()


async def reset_and_reseed():
    collections = [
        "machine_slots", "slot_qr_master", "bin_qr_master", "bin_storage", "saved_bins",
        "kitchen_preparation_requests", "pickup_tasks", "bin_replacement_tasks", "cleaning_tasks",
        "dirty_bin_returns", "live_task_progress", "alerts", "sales_orders", "activity_logs",
        "notifications", "qr_scan_logs", "bulk_replacement_orders", "maintenance_tickets",
        "maintenance_work_orders", "preventive_maintenance_schedules", "machine_diagnostics",
        "spare_parts_inventory", "spare_parts_requests", "technician_workload", "machine_health_logs",
        "technical_alerts", "admin_audit_logs", "escalations", "change_requests",
    ]
    for c in collections:
        await db[c].delete_many({})
    await run_seed()
