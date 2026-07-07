"""Additive demo-scenario seeding. Runs on top of the base seed (idempotent via a
marker doc) so every core workflow is demonstrable from first login:
- Bulk Pre-Schedule order (Supervisor -> Kitchen -> Operations Staff)
- Single supervisor-assigned task mid-flow (waiting for kitchen)
- One fully completed replacement task with full timeline
- Dirty bins moving through the kitchen cleaning lifecycle
- Partially completed machine cleaning task with mock photos
- Open kitchen change request + recent activity logs
"""
from datetime import datetime, timezone, timedelta

from database import db
from auth_utils import new_id, now_iso
from seed_constants import machine_label, CLEANING_STEPS
from workflow import create_replacement_pipeline

MOCK_PHOTO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

USER_PROFILES = {
    "kitchen01": ("Rakesh Kumar", "kitchen01@proteinhulk.com"),
    "operations01": ("Anil Verma", "operations01@proteinhulk.com"),
    "operations02": ("Suresh Reddy", "operations02@proteinhulk.com"),
    "operations_sup01": ("Priya Sharma", "ops_sup@proteinhulk.com"),
    "tech01": ("Vikram Singh", "tech01@proteinhulk.com"),
    "maintenance_sup01": ("Ravi Patel", "maint_sup@proteinhulk.com"),
    "admin01": ("System Admin", "admin@proteinhulk.com"),
}


def ago(minutes=0, hours=0, days=0):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes, hours=hours, days=days)).isoformat()


async def seed_demo_data():
    for username, (name, email) in USER_PROFILES.items():
        await db.users.update_one({"username": username}, {"$set": {"name": name, "email": email}})

    await _seed_bulk_order_demo()
    await _seed_midflow_task_demo()
    await _seed_completed_task_demo()
    await _seed_cleaning_bins_demo()
    await _seed_machine_cleaning_demo()
    await _seed_change_request_demo()
    await _seed_activity_logs()


async def _seed_bulk_order_demo():
    """Bulk Pre-Schedule Replacements order on M004 assigned to operations02."""
    if await db.bulk_replacement_orders.find_one({"demo": True}):
        return
    order_id = new_id()
    items_spec = [
        ("M004-L4", "L4", "High", True, "Bulk restock - Pomegranate Juice running low"),
        ("M004-P1", "P1", "Medium", True, "Weekly protein powder refresh"),
        ("M004-S3", "S3", "Medium", False, "Spare banana bin should be available in storage"),
    ]
    created_items = []
    for slot_id, code, priority, kitchen_required, comment in items_spec:
        result = await create_replacement_pipeline(
            "M004", slot_id, "operations_sup01",
            assigned_operations_staff="operations02", source="bulk_order", bulk_order_id=order_id,
            priority=priority, comment=comment, kitchen_required=kitchen_required,
        )
        created_items.append({
            "slot_id": slot_id, "ingredient_code": code, "priority": priority,
            "kitchen_required_requested": kitchen_required, "comment": comment, **result,
        })
    await db.bulk_replacement_orders.insert_one({
        "id": order_id, "machine_id": "M004", "machine_label": machine_label("M004"),
        "operations_staff": "operations02", "items": created_items, "status": "Placed",
        "created_by": "operations_sup01", "created_at": ago(minutes=45), "demo": True,
    })


async def _seed_midflow_task_demo():
    """Single supervisor pre-scheduled task on M002 (Coconut Milk) waiting for kitchen."""
    if await db.bin_replacement_tasks.find_one({"slot_id": "M002-L1", "source": "pre_schedule"}):
        return
    await create_replacement_pipeline(
        "M002", "M002-L1", "operations_sup01",
        assigned_operations_staff="operations01", source="pre_schedule",
        priority="High", comment="Coconut Milk approaching low level - replace today",
        kitchen_required=True,
    )


async def _seed_completed_task_demo():
    """Fully completed replacement on M003 (Strawberry) with an 8-stage timeline."""
    if await db.bin_replacement_tasks.find_one({"id": "DEMO-BRT-001"}):
        return
    slot = await db.machine_slots.find_one({"id": "M003-S8"})
    if not slot:
        return
    brt_id, pt_id, kpr_id = "DEMO-BRT-001", "DEMO-PT-001", "DEMO-KPR-001"
    old_bin, new_bin = "BIN-DEMO-OLD-1", "BIN-DEMO-NEW-1"

    for bin_id, status, location, ingredient in [
        (old_bin, "Dirty / Returned from Machine", "Kitchen", "S8"),
        (new_bin, "Placed in Machine", "M003", "S8"),
    ]:
        await db.bin_qr_master.update_one({"id": bin_id}, {"$set": {
            "id": bin_id, "bin_id": bin_id, "qr_code_id": f"QR-{bin_id}", "bin_type": "Solid",
        }}, upsert=True)
        await db.bin_storage.update_one({"id": bin_id}, {"$set": {
            "id": bin_id, "qr_code_id": f"QR-{bin_id}", "bin_type": "Solid", "status": status,
            "current_ingredient_code": ingredient, "previous_ingredient_code": None,
            "last_used_machine": "M003", "last_used_slot": "M003-S8",
            "last_cleaned_date": ago(days=2), "location": location,
        }}, upsert=True)

    await db.bin_replacement_tasks.insert_one({
        "id": brt_id, "machine_id": "M003", "machine_label": machine_label("M003"), "slot_id": "M003-S8",
        "ingredient_code": "S8", "ingredient_name": slot["ingredient_name"],
        "alert_id": None, "bulk_order_id": None, "source": "pre_schedule", "priority": "Medium",
        "comments": [{"comment": "Routine strawberry bin swap", "by": "operations_sup01", "at": ago(hours=2)}],
        "assigned_operations_staff": "operations01",
        "old_bin_id": old_bin, "old_bin_qr_code_id": f"QR-{old_bin}",
        "new_bin_id": new_bin, "new_bin_scanned": True, "slot_scanned": True,
        "old_bin_removed": True, "old_bin_scanned": True, "pickup_task_id": pt_id,
        "stage": "Closed", "status": "Completed", "created_at": ago(hours=2),
    })
    await db.pickup_tasks.insert_one({
        "id": pt_id, "machine_id": "M003", "machine_label": machine_label("M003"), "slot_id": "M003-S8",
        "ingredient_code": "S8", "ingredient_name": slot["ingredient_name"],
        "assigned_operations_staff": "operations01", "kitchen_prep_request_id": kpr_id,
        "bin_replacement_task_id": brt_id, "bulk_order_id": None,
        "bin_id": new_bin, "qr_code_id": f"QR-{new_bin}", "status": "Picked", "created_at": ago(hours=2),
    })
    await db.kitchen_preparation_requests.insert_one({
        "id": kpr_id, "machine_id": "M003", "machine_label": machine_label("M003"), "slot_id": "M003-S8",
        "ingredient_code": "S8", "ingredient_name": slot["ingredient_name"],
        "quantity": slot["capacity"], "unit": slot["unit"], "alert_id": None, "bulk_order_id": None,
        "bin_replacement_task_id": brt_id, "pickup_task_id": pt_id, "status": "Picked",
        "created_by": "operations_sup01", "requested_at": ago(hours=2), "bin_id": new_bin,
    })
    await db.saved_bins.insert_one({
        "id": "DEMO-SAVEDBIN-001", "bin_id": new_bin, "qr_code_id": f"QR-{new_bin}",
        "ingredient_code": "S8", "ingredient_name": slot["ingredient_name"],
        "quantity": slot["capacity"], "unit": slot["unit"],
        "expiry_date": ago(days=-7), "replacement_due_date": ago(days=-6),
        "status": "Installed", "machine_id": "M003", "machine_label": machine_label("M003"),
        "slot_id": "M003-S8", "kitchen_prep_request_id": kpr_id, "pickup_task_id": pt_id,
        "created_at": ago(hours=2),
    })
    await db.dirty_bin_returns.insert_one({
        "id": "DEMO-DIRTY-001", "bin_id": old_bin, "qr_code_id": f"QR-{old_bin}",
        "machine_id": "M003", "machine_label": machine_label("M003"), "slot_id": "M003-S8",
        "ingredient_code": "S8", "ingredient_name": slot["ingredient_name"],
        "status": "Washing Pending", "returned_by": "operations01", "returned_at": ago(minutes=50),
    })

    stages = [
        ("Task Created", "operations_sup01", 120), ("Kitchen Fill Ticket Created", "operations_sup01", 118),
        ("Kitchen Preparation Started", "kitchen01", 110), ("Bin Filled and Saved", "kitchen01", 95),
        ("Ready for Pickup", "kitchen01", 90), ("Picked from Kitchen", "operations01", 60),
        ("New Bin Placed in Machine", "operations01", 40), ("Closed", "operations01", 35),
    ]
    await db.live_task_progress.insert_one({
        "id": new_id(), "ref_type": "bin_replacement_task", "ref_id": brt_id,
        "machine_id": "M003", "machine_label": machine_label("M003"),
        "current_stage": "Closed",
        "history": [{"stage": s, "at": ago(minutes=m), "by": by} for s, by, m in stages],
        "created_at": ago(hours=2), "updated_at": ago(minutes=35),
    })


async def _seed_cleaning_bins_demo():
    """A second dirty bin just returned to kitchen (start of cleaning lifecycle)."""
    if await db.dirty_bin_returns.find_one({"id": "DEMO-DIRTY-002"}):
        return
    bin_id = "BIN-DEMO-OLD-2"
    await db.bin_qr_master.update_one({"id": bin_id}, {"$set": {
        "id": bin_id, "bin_id": bin_id, "qr_code_id": f"QR-{bin_id}", "bin_type": "Liquid",
    }}, upsert=True)
    await db.bin_storage.update_one({"id": bin_id}, {"$set": {
        "id": bin_id, "qr_code_id": f"QR-{bin_id}", "bin_type": "Liquid", "status": "Dirty / Returned from Machine",
        "current_ingredient_code": "L2", "previous_ingredient_code": None,
        "last_used_machine": "M002", "last_used_slot": "M002-L2",
        "last_cleaned_date": ago(days=3), "location": "Kitchen",
    }}, upsert=True)
    await db.dirty_bin_returns.insert_one({
        "id": "DEMO-DIRTY-002", "bin_id": bin_id, "qr_code_id": f"QR-{bin_id}",
        "machine_id": "M002", "machine_label": machine_label("M002"), "slot_id": "M002-L2",
        "ingredient_code": "L2", "ingredient_name": "Almond Milk",
        "status": "Returned to Kitchen", "returned_by": "operations01", "returned_at": ago(minutes=25),
    })


async def _seed_machine_cleaning_demo():
    """Today's cleaning task on M001, first 3 steps done with mock photos; plus a
    completed cleaning from yesterday on M003 for reports."""
    today = datetime.now(timezone.utc).date().isoformat()
    existing = await db.cleaning_tasks.find_one({"machine_id": "M001", "date": today})
    steps = []
    for i, name in enumerate(CLEANING_STEPS):
        done = i < 3
        steps.append({"name": name, "photo": MOCK_PHOTO if done else None,
                      "comment": "Cleaned and sanitized" if done else "", "completed": done})
    if not existing:
        await db.cleaning_tasks.insert_one({
            "id": "DEMO-CLEAN-001", "machine_id": "M001", "machine_label": machine_label("M001"),
            "date": today, "status": "In Progress", "created_at": ago(minutes=30), "steps": steps,
        })
    elif not any(s["completed"] for s in existing.get("steps", [])):
        await db.cleaning_tasks.update_one({"id": existing["id"]}, {"$set": {"steps": steps}})

    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    if not await db.cleaning_tasks.find_one({"machine_id": "M003", "date": yesterday}):
        await db.cleaning_tasks.insert_one({
            "id": "DEMO-CLEAN-002", "machine_id": "M003", "machine_label": machine_label("M003"),
            "date": yesterday, "status": "Completed", "created_at": ago(days=1),
            "steps": [{"name": n, "photo": MOCK_PHOTO, "comment": "Done", "completed": True} for n in CLEANING_STEPS],
        })
        await db.machines.update_one({"id": "M003"}, {"$set": {"last_cleaning_date": ago(days=1)}})


async def _seed_change_request_demo():
    if await db.change_requests.find_one({"id": "DEMO-CR-001"}):
        return
    kpr = await db.kitchen_preparation_requests.find_one({"status": {"$in": ["Pending", "Saved / Ready for Pickup"]}})
    await db.change_requests.insert_one({
        "id": "DEMO-CR-001", "prep_request_id": kpr["id"] if kpr else "DEMO-KPR-001",
        "message": "Quantity slightly overfilled (9600 instead of 9500) due to human error - please confirm correction.",
        "status": "Open", "raised_by": "kitchen01", "created_at": ago(hours=1),
    })


async def _seed_activity_logs():
    if await db.activity_logs.find_one({"action": "Assigned bin replacement task", "details.task_id": "DEMO-BRT-001"}):
        return
    entries = [
        ("operations_sup01", "operations_supervisor", "Login", {}, 180),
        ("operations_sup01", "operations_supervisor", "Assigned bin replacement task", {"task_id": "DEMO-BRT-001", "machine_id": "M003"}, 150),
        ("kitchen01", "kitchen_staff", "Saved filled bin", {"bin_id": "BIN-DEMO-NEW-1", "machine_id": "M003"}, 95),
        ("operations01", "operations_staff", "Completed bin replacement", {"task_id": "DEMO-BRT-001"}, 35),
        ("operations01", "operations_staff", "Login", {}, 10),
        ("kitchen01", "kitchen_staff", "Login", {}, 5),
    ]
    for username, role, action, details, mins in entries:
        await db.activity_logs.insert_one({
            "id": new_id(), "username": username, "role": role, "action": action,
            "details": details, "created_at": ago(minutes=mins),
        })
