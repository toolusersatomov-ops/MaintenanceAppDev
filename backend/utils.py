"""Shared helper functions used across routers: notifications, activity logs,
and live task progress timeline entries."""
from datetime import datetime, timezone
from auth_utils import new_id
from database import db
from seed_constants import machine_label


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def push_notification(target_role: str = None, target_username: str = None, title: str = "", message: str = "", link: str = None):
    doc = {
        "id": new_id(),
        "target_role": target_role,
        "target_username": target_username,
        "title": title,
        "message": message,
        "link": link,
        "read": False,
        "created_at": now_iso(),
    }
    await db.notifications.insert_one(doc)
    return doc


async def log_activity(username: str, role: str, action: str, details: dict = None):
    doc = {
        "id": new_id(),
        "username": username,
        "role": role,
        "action": action,
        "details": details or {},
        "created_at": now_iso(),
    }
    await db.activity_logs.insert_one(doc)
    return doc


async def push_progress(ref_type: str, ref_id: str, machine_id: str, stage: str, by: str = "system", extra: dict = None):
    """Append a stage to the live_task_progress timeline for a given task/alert."""
    existing = await db.live_task_progress.find_one({"ref_type": ref_type, "ref_id": ref_id})
    entry = {"stage": stage, "at": now_iso(), "by": by}
    if extra:
        entry.update(extra)
    if existing:
        await db.live_task_progress.update_one(
            {"id": existing["id"]},
            {"$set": {"current_stage": stage, "updated_at": now_iso()}, "$push": {"history": entry}},
        )
        return existing["id"]
    doc = {
        "id": new_id(),
        "ref_type": ref_type,
        "ref_id": ref_id,
        "machine_id": machine_id,
        "machine_label": machine_label(machine_id) if machine_id else None,
        "current_stage": stage,
        "history": [entry],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.live_task_progress.insert_one(doc)
    return doc["id"]


async def record_scan_action(screen: str, qr_code_id: str, affected_record_type: str, affected_record_id: str,
                              status_before: str, status_after: str, scanned_by: str, revert_data: dict = None):
    doc = {
        "id": new_id(),
        "screen": screen,
        "qr_code_id": qr_code_id,
        "affected_record_type": affected_record_type,
        "affected_record_id": affected_record_id,
        "status_before": status_before,
        "status_after": status_after,
        "scanned_by": scanned_by,
        "scanned_at": now_iso(),
        "undone": False,
        "confirmed": False,
        "revert_data": revert_data or {},
    }
    await db.qr_scan_logs.insert_one(doc)
    return doc
