"""Core cross-collection workflow helpers shared by Alerts, Pre-Schedule Tasks,
and Bulk Replacement flows. Encapsulates the multi-collection creation logic so
Supervisor actions consistently connect Kitchen + Operations Staff records."""
from database import db
from auth_utils import new_id, now_iso
from seed_constants import machine_label
from utils import push_progress, push_notification, log_activity
from datetime import datetime, timezone, timedelta


async def create_replacement_pipeline(machine_id: str, slot_id: str, created_by: str,
                                       assigned_operations_staff: str = None, alert_id: str = None,
                                       source: str = "alert", bulk_order_id: str = None,
                                       priority: str = "Medium", comment: str = None,
                                       kitchen_required: bool = True):
    """Creates a binReplacementTask + pickupTask + (optionally) kitchenPreparationRequest
    for a single machine slot that needs a bin refill/replacement. Returns the ids.
    When kitchen_required=False and a matching spare Clean bin is already available in
    bin_storage, the kitchen step is skipped entirely and the pickup task goes straight
    to "Ready for Pickup" using that spare bin. Falls back to the normal kitchen flow if
    no spare bin is available."""
    slot = await db.machine_slots.find_one({"id": slot_id})
    if not slot:
        raise ValueError(f"Slot {slot_id} not found")

    brt_id = new_id()
    pt_id = new_id()
    kpr_id = None

    auto_bin = None
    if not kitchen_required:
        auto_bin = await db.bin_storage.find_one({"bin_type": slot["slot_type"], "status": "Clean / Ready for Filling"})

    if auto_bin:
        await db.bin_storage.update_one({"id": auto_bin["id"]}, {"$set": {
            "status": "Handed Over", "current_ingredient_code": slot["ingredient_code"], "location": "Reserved for Pickup",
        }})
        pickup_status, bin_id_for_pickup, qr_for_pickup = "Ready for Pickup", auto_bin["id"], auto_bin["qr_code_id"]
    else:
        kpr_id = new_id()
        await db.kitchen_preparation_requests.insert_one({
            "id": kpr_id, "machine_id": machine_id, "machine_label": machine_label(machine_id), "slot_id": slot_id,
            "ingredient_code": slot["ingredient_code"], "ingredient_name": slot["ingredient_name"],
            "quantity": slot["capacity"], "unit": slot["unit"], "alert_id": alert_id, "bulk_order_id": bulk_order_id,
            "bin_replacement_task_id": brt_id, "pickup_task_id": pt_id, "status": "Pending",
            "priority": priority, "required_by": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
            "created_by": created_by, "requested_at": now_iso(), "bin_id": None,
        })
        pickup_status, bin_id_for_pickup, qr_for_pickup = "Pending Prep", None, None

    await db.bin_replacement_tasks.insert_one({
        "id": brt_id, "machine_id": machine_id, "machine_label": machine_label(machine_id), "slot_id": slot_id,
        "ingredient_code": slot["ingredient_code"], "ingredient_name": slot["ingredient_name"],
        "alert_id": alert_id, "bulk_order_id": bulk_order_id, "source": source, "priority": priority,
        "comments": [{"comment": comment, "by": created_by, "at": now_iso()}] if comment else [],
        "assigned_operations_staff": assigned_operations_staff,
        "old_bin_id": slot["current_bin_id"], "old_bin_qr_code_id": slot["current_bin_qr_code_id"],
        "new_bin_id": None, "new_bin_scanned": False, "slot_scanned": False,
        "old_bin_removed": False, "old_bin_scanned": False, "pickup_task_id": pt_id,
        "stage": "Kitchen Fill Ticket Created" if kpr_id else "Auto-Fulfilled from Spare Bin",
        "status": "Awaiting Kitchen" if kpr_id else "Awaiting Pickup", "created_at": now_iso(),
    })

    await db.pickup_tasks.insert_one({
        "id": pt_id, "machine_id": machine_id, "machine_label": machine_label(machine_id), "slot_id": slot_id,
        "ingredient_code": slot["ingredient_code"], "ingredient_name": slot["ingredient_name"],
        "assigned_operations_staff": assigned_operations_staff, "kitchen_prep_request_id": kpr_id,
        "bin_replacement_task_id": brt_id, "bulk_order_id": bulk_order_id,
        "bin_id": bin_id_for_pickup, "qr_code_id": qr_for_pickup,
        "status": pickup_status, "created_at": now_iso(),
    })

    for stage in ["Alert Reviewed by Supervisor", "Operations Staff Assigned", "Kitchen Fill Ticket Created" if kpr_id else "Auto-Fulfilled from Spare Bin (Kitchen Not Required)"]:
        await push_progress("alert" if alert_id else "bin_replacement_task", alert_id or brt_id, machine_id, stage, by=created_by)

    if kpr_id:
        await push_notification(target_username="kitchen01", title="New Kitchen Fill Ticket",
                                 message=f"Prepare {slot['ingredient_name']} ({slot['capacity']} {slot['unit']}) for {machine_label(machine_id)}",
                                 link="/kitchen/preparation-requests")
    if assigned_operations_staff:
        await push_notification(target_username=assigned_operations_staff, title="New Bin Replacement Task",
                                 message=f"Replace {slot['ingredient_name']} bin on {machine_label(machine_id)}",
                                 link="/operations/bin-replacement-tasks")

    await log_activity(created_by, "operations_supervisor", "Created replacement pipeline",
                        {"machine_id": machine_id, "slot_id": slot_id, "source": source, "bulk_order_id": bulk_order_id})

    return {"bin_replacement_task_id": brt_id, "pickup_task_id": pt_id, "kitchen_prep_request_id": kpr_id, "kitchen_required": kpr_id is not None}
