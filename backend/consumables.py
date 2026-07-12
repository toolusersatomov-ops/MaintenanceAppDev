"""Consumable alert evaluation: Waste Water Cans (WWC1-3), Water Cans (WC1-2),
and Cup Dispenser. Called on startup and via POST /api/alerts/evaluate-consumables.
Idempotent: never duplicates an open alert of the same type on the same machine."""
from database import db
from auth_utils import new_id, now_iso
from seed_constants import machine_label
from utils import push_notification

OPEN_STATUSES = ["Open", "Assigned", "Acknowledged"]


def _pct(slot):
    return slot.get("current_level_pct", 0) if slot else 0


async def _open_alert_exists(machine_id, alert_type):
    return await db.alerts.find_one({"machine_id": machine_id, "alert_type": alert_type, "status": {"$in": OPEN_STATUSES}})


async def _create_alert(machine_id, alert_type, message, slot, priority="High", related_slots=None,
                        awareness_only=False, ingredient_name=None, waste_status=None):
    alert_id = new_id()
    doc = {
        "id": alert_id, "alert_type": alert_type, "machine_id": machine_id, "machine_label": machine_label(machine_id),
        "slot_id": slot["id"], "slot_type": slot["slot_type"], "ingredient_code": slot["ingredient_code"],
        "ingredient_name": ingredient_name or slot["ingredient_name"],
        "current_quantity": slot["current_quantity"], "unit": slot["unit"],
        "current_level_pct": slot["current_level_pct"], "full_capacity": slot["capacity"],
        "expiry_date": slot.get("expiry_date"), "replacement_due_date": slot.get("replacement_due_date"),
        "current_bin_id": slot.get("current_bin_id"), "current_bin_qr_code_id": slot.get("current_bin_qr_code_id"),
        "priority": priority, "created_at": now_iso(), "recipes_affected": [],
        "alert_message": message, "suggested_action": message,
        "awareness_only": awareness_only,
        "related_slot_ids": related_slots or [slot["id"]],
        "waste_water_status": waste_status,
        "status": "Open", "assigned_operations_staff": None, "bin_replacement_task_id": None,
        "pickup_task_id": None, "kitchen_prep_request_id": None,
    }
    await db.alerts.insert_one(doc)
    await push_notification(target_role="operations_supervisor", title=alert_type, message=message, link="/supervisor/alerts")
    return alert_id


async def evaluate_consumable_alerts():
    created = []
    machines = await db.machines.find().to_list(100)
    for m in machines:
        mid = m["id"]
        slots = {s["slot_code"]: s async for s in db.machine_slots.find({"machine_id": mid, "slot_code": {"$in": ["WWC1", "WWC2", "WWC3", "WC1", "WC2", "CAN"]}})}

        # --- Waste water logic: WWC1 is a temporary receiving/transfer can ---
        wwc2, wwc3 = slots.get("WWC2"), slots.get("WWC3")
        if wwc2 and wwc3:
            p2, p3 = _pct(wwc2), _pct(wwc3)
            if p2 >= 90 and p3 >= 90:
                for s in (wwc2, wwc3):
                    await db.machine_slots.update_one({"id": s["id"]}, {"$set": {"status": "Replacement Required"}})
                if not await _open_alert_exists(mid, "Waste Water Full"):
                    aid = await _create_alert(
                        mid, "Waste Water Full",
                        "WWC2 and WWC3 are almost full. Change / empty WWC2 and WWC3 together.",
                        wwc2, priority="High", related_slots=[wwc2["id"], wwc3["id"]],
                        ingredient_name="WWC2 + WWC3", waste_status="Replacement Required")
                    created.append(aid)
                # supersede the awareness alert if still open
                await db.alerts.update_many({"machine_id": mid, "alert_type": "Waste Water Monitoring", "status": "Open"},
                                             {"$set": {"status": "Resolved"}})
            elif p2 >= 90:
                await db.machine_slots.update_one({"id": wwc2["id"]}, {"$set": {"status": "Monitoring Required"}})
                if not await _open_alert_exists(mid, "Waste Water Monitoring") and not await _open_alert_exists(mid, "Waste Water Full"):
                    aid = await _create_alert(
                        mid, "Waste Water Monitoring",
                        "WWC2 is 90% full. Monitor waste water level.",
                        wwc2, priority="Medium", awareness_only=True, waste_status="Monitoring Required")
                    created.append(aid)

        # --- Water can logic: low below 15% ---
        wc1, wc2 = slots.get("WC1"), slots.get("WC2")
        low1 = wc1 and _pct(wc1) < 15
        low2 = wc2 and _pct(wc2) < 15
        if low1 and low2:
            if not await _open_alert_exists(mid, "Low Water Combined"):
                aid = await _create_alert(
                    mid, "Low Water Combined",
                    "WC1 and WC2 water levels are low. Replace/refill both water cans.",
                    wc1, priority="High", related_slots=[wc1["id"], wc2["id"]], ingredient_name="WC1 + WC2")
                created.append(aid)
            await db.alerts.update_many({"machine_id": mid, "alert_type": "Low Water", "status": "Open"},
                                         {"$set": {"status": "Resolved"}})
        else:
            for slot, low, code in ((wc1, low1, "WC1"), (wc2, low2, "WC2")):
                if low:
                    existing = await db.alerts.find_one({"machine_id": mid, "alert_type": "Low Water",
                                                          "slot_id": slot["id"], "status": {"$in": OPEN_STATUSES}})
                    if not existing and not await _open_alert_exists(mid, "Low Water Combined"):
                        aid = await _create_alert(mid, "Low Water", f"{code} water level is low.", slot, priority="High")
                        created.append(aid)

        # --- Cup dispenser logic: low at 15% or below ---
        can = slots.get("CAN")
        if can and _pct(can) <= 15:
            if not await _open_alert_exists(mid, "Low Cups"):
                aid = await _create_alert(mid, "Low Cups", "Cup Dispenser level is low.", can, priority="Medium")
                created.append(aid)

    return created
