from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
from database import db, serialize, serialize_list
from auth_utils import get_current_user, require_roles, new_id, now_iso, ANY_KITCHEN
from seed_constants import machine_label
from utils import push_progress, push_notification, log_activity

router = APIRouter(prefix="/api/kitchen", tags=["kitchen"])

EXPIRY_DAYS = {"Liquid": 5, "Powder": 180, "Solid": 4, "Other": 60}
DUE_DAYS = {"Liquid": 3, "Powder": 30, "Solid": 3, "Other": 14}


def iso_days(n):
    return (datetime.now(timezone.utc) + timedelta(days=n)).isoformat()


@router.get("/preparation-requests")
async def preparation_requests(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if status:
        query["status"] = status
    items = await db.kitchen_preparation_requests.find(query).sort("requested_at", -1).to_list(1000)
    return serialize_list(items)


@router.post("/preparation-requests/{req_id}/start")
async def start_preparation(req_id: str, user: dict = Depends(require_roles(*ANY_KITCHEN))):
    req = await db.kitchen_preparation_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req["status"] != "Pending":
        raise HTTPException(status_code=400, detail="This request is not pending")
    await db.kitchen_preparation_requests.update_one({"id": req_id}, {"$set": {"status": "In Progress"}})
    await push_progress("kitchen_preparation_request", req_id, req["machine_id"], "Kitchen Preparation Started", by=user["username"])
    await log_activity(user["username"], user["role"], "Started preparation", {"request_id": req_id})
    return {"message": "Preparation started"}


@router.get("/preparation-requests/{req_id}/bin-options")
async def bin_options(req_id: str, user: dict = Depends(get_current_user)):
    req = await db.kitchen_preparation_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    slot = await db.machine_slots.find_one({"id": req["slot_id"]})
    bins = await db.bin_storage.find({"bin_type": slot["slot_type"], "status": "Clean / Ready for Filling"}).to_list(100)
    return serialize_list(bins)


class ScanBinBody(BaseModel):
    bin_id: str


@router.post("/preparation-requests/{req_id}/scan-bin")
async def scan_bin(req_id: str, body: ScanBinBody, user: dict = Depends(require_roles(*ANY_KITCHEN))):
    req = await db.kitchen_preparation_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    bin_doc = await db.bin_storage.find_one({"id": body.bin_id})
    if not bin_doc:
        raise HTTPException(status_code=404, detail="Bin QR not recognized")
    slot = await db.machine_slots.find_one({"id": req["slot_id"]})
    if bin_doc["bin_type"] != slot["slot_type"]:
        raise HTTPException(status_code=400, detail="Scanned bin type does not match the requested slot type.")
    if bin_doc["status"] != "Clean / Ready for Filling":
        raise HTTPException(status_code=400, detail="This bin is not marked clean. Please clean the bin before filling.")

    category = slot["slot_type"]
    expiry_date = iso_days(EXPIRY_DAYS.get(category, 14))
    due_date = iso_days(DUE_DAYS.get(category, 7))

    await push_progress("kitchen_preparation_request", req_id, req["machine_id"], "Bin QR Scanned by Kitchen", by=user["username"])
    await log_activity(user["username"], user["role"], "Scanned bin QR", {"bin_id": body.bin_id, "request_id": req_id})

    return {
        "bin_id": bin_doc["id"], "qr_code_id": bin_doc["qr_code_id"], "bin_type": bin_doc["bin_type"],
        "slot_type": slot["slot_type"], "current_bin_status": bin_doc["status"],
        "previous_ingredient": bin_doc.get("previous_ingredient_code") or bin_doc.get("current_ingredient_code"),
        "clean_status": "Clean / Ready for Filling", "last_used_machine": bin_doc.get("last_used_machine"),
        "last_used_slot": bin_doc.get("last_used_slot"), "last_cleaned_date": bin_doc.get("last_cleaned_date"),
        "quantity": req["quantity"], "unit": req["unit"], "expiry_date": expiry_date, "replacement_due_date": due_date,
        "ingredient_name": req["ingredient_name"],
    }


class SaveBinBody(BaseModel):
    bin_id: str
    quantity: float
    unit: str
    expiry_date: str
    replacement_due_date: str


@router.post("/preparation-requests/{req_id}/save-bin")
async def save_bin(req_id: str, body: SaveBinBody, user: dict = Depends(require_roles(*ANY_KITCHEN))):
    req = await db.kitchen_preparation_requests.find_one({"id": req_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    bin_doc = await db.bin_storage.find_one({"id": body.bin_id})
    if not bin_doc:
        raise HTTPException(status_code=400, detail="Please scan bin QR before saving this preparation.")
    if bin_doc["status"] != "Clean / Ready for Filling":
        raise HTTPException(status_code=400, detail="This bin is not marked clean. Please clean the bin before filling.")

    saved_bin_id = new_id()
    await db.saved_bins.insert_one({
        "id": saved_bin_id, "bin_id": bin_doc["id"], "qr_code_id": bin_doc["qr_code_id"],
        "ingredient_code": req["ingredient_code"], "ingredient_name": req["ingredient_name"],
        "quantity": body.quantity, "unit": body.unit, "expiry_date": body.expiry_date,
        "replacement_due_date": body.replacement_due_date, "status": "Saved / Ready for Pickup",
        "machine_id": req["machine_id"], "machine_label": req["machine_label"], "slot_id": req["slot_id"],
        "kitchen_prep_request_id": req_id, "pickup_task_id": req["pickup_task_id"], "created_at": now_iso(),
        "prepared_by": user["username"],
    })

    await db.bin_storage.update_one({"id": bin_doc["id"]}, {"$set": {
        "status": "Handed Over", "current_ingredient_code": req["ingredient_code"], "location": "Kitchen Storage",
    }})

    await db.kitchen_preparation_requests.update_one({"id": req_id}, {"$set": {
        "status": "Saved / Ready for Pickup", "bin_id": bin_doc["id"],
    }})

    if req.get("pickup_task_id"):
        await db.pickup_tasks.update_one({"id": req["pickup_task_id"]}, {"$set": {
            "status": "Ready for Pickup", "bin_id": bin_doc["id"], "qr_code_id": bin_doc["qr_code_id"],
        }})

    await push_progress("kitchen_preparation_request", req_id, req["machine_id"], "Bin Filled and Saved", by=user["username"])
    await push_progress("kitchen_preparation_request", req_id, req["machine_id"], "Ready for Pickup", by=user["username"])
    if req.get("assigned_operations_staff") is None:
        pt = await db.pickup_tasks.find_one({"id": req.get("pickup_task_id")})
        target_user = pt["assigned_operations_staff"] if pt else None
    else:
        target_user = req.get("assigned_operations_staff")
    if not target_user and req.get("pickup_task_id"):
        pt = await db.pickup_tasks.find_one({"id": req["pickup_task_id"]})
        target_user = pt.get("assigned_operations_staff") if pt else None
    if target_user:
        await push_notification(target_username=target_user, title="Bin Ready for Pickup",
                                 message=f"{req['ingredient_name']} bin ready for pickup at {req['machine_label']}",
                                 link="/operations/pickup-list")
    await log_activity(user["username"], user["role"], "Saved filled bin", {"bin_id": bin_doc["id"], "request_id": req_id})
    return {"message": "Bin saved. Status: Saved / Ready for Pickup", "saved_bin_id": saved_bin_id}


@router.get("/bin-storage")
async def bin_storage(user: dict = Depends(get_current_user)):
    bins = await db.bin_storage.find().to_list(2000)
    saved = await db.saved_bins.find().to_list(2000)
    grouped = {}
    for b in bins:
        key = b.get("current_ingredient_code") or b["bin_type"]
        grouped.setdefault(key, {"ingredient_code": key, "bin_type": b["bin_type"], "bins": []})
        grouped[key]["bins"].append(serialize(b))
    return {"bins": serialize_list(bins), "saved_bins": serialize_list(saved), "grouped": list(grouped.values())}


@router.get("/scanned-bin-history")
async def scanned_bin_history(user: dict = Depends(get_current_user)):
    logs = await db.activity_logs.find({"action": {"$in": ["Scanned bin QR", "Saved filled bin"]}}).sort("created_at", -1).to_list(500)
    return serialize_list(logs)


class ChangeRequestBody(BaseModel):
    prep_request_id: str
    message: str


@router.get("/change-requests")
async def list_change_requests(user: dict = Depends(get_current_user)):
    items = await db.change_requests.find().sort("created_at", -1).to_list(500)
    return serialize_list(items)


@router.post("/change-requests")
async def create_change_request(body: ChangeRequestBody, user: dict = Depends(require_roles(*ANY_KITCHEN))):
    doc = {
        "id": new_id(), "prep_request_id": body.prep_request_id, "message": body.message,
        "status": "Open", "raised_by": user["username"], "created_at": now_iso(),
    }
    await db.change_requests.insert_one(doc)
    await push_notification(target_role="operations_supervisor", title="Kitchen Change Request",
                             message=body.message, link="/supervisor/kitchen-preparation-status")
    return serialize(doc)


@router.post("/change-requests/{req_id}/resolve")
async def resolve_change_request(req_id: str, user: dict = Depends(get_current_user)):
    await db.change_requests.update_one({"id": req_id}, {"$set": {"status": "Resolved"}})
    return {"message": "Marked resolved"}


CLEANING_LIFECYCLE = ["Dirty / Returned from Machine", "Returned to Kitchen", "Washing Pending", "Washed", "Drying", "Dried", "Clean / Ready for Filling"]
KITCHEN_VISIBLE_STAGES = ["Returned to Kitchen", "Washing Pending", "Washed", "Drying", "Dried"]


@router.get("/cleaning-bins")
async def cleaning_bins(user: dict = Depends(get_current_user)):
    items = await db.dirty_bin_returns.find({"status": {"$in": KITCHEN_VISIBLE_STAGES}}).sort("returned_at", -1).to_list(500)
    today = now_iso()[:10]
    cleaned_today = await db.dirty_bin_returns.count_documents({"status": "Clean / Ready for Filling", "cleaned_at": {"$gte": today}})
    return {"items": serialize_list(items), "counters": {
        "total": len(items) + cleaned_today, "cleaned": cleaned_today, "pending": len(items),
    }}


async def _mark_bin_clean(item: dict, username: str, role: str, via: str):
    await db.bin_storage.update_one({"id": item["bin_id"]}, {"$set": {
        "status": "Clean / Ready for Filling", "previous_ingredient_code": item.get("ingredient_code"),
        "current_ingredient_code": None, "last_cleaned_date": now_iso(), "location": "Kitchen Storage",
    }})
    await db.dirty_bin_returns.update_one({"id": item["id"]}, {"$set": {
        "status": "Clean / Ready for Filling", "cleaned_at": now_iso(), "cleaned_by": username,
    }})
    await push_progress("dirty_bin_return", item["id"], item["machine_id"], "Kitchen Cleaning Completed", by=username)
    await push_notification(target_role="operations_supervisor", title="Bin Cleaned",
                             message=f"{item['ingredient_name']} bin ({item['bin_id']}) cleaned and ready for filling",
                             link="/supervisor/live-task-progress")
    await log_activity(username, role, f"Bin marked clean via {via}", {"return_id": item["id"], "bin_id": item["bin_id"]})


class CleaningScanBody(BaseModel):
    qr_code_id: str


@router.post("/cleaning-bins/scan")
async def scan_cleaning_bin(body: CleaningScanBody, user: dict = Depends(require_roles(*ANY_KITCHEN))):
    """Fast hands-busy flow: scanning a valid dirty bin QR instantly marks it clean."""
    item = await db.dirty_bin_returns.find_one({"qr_code_id": body.qr_code_id, "status": {"$in": KITCHEN_VISIBLE_STAGES}})
    if not item:
        already = await db.dirty_bin_returns.find_one({"qr_code_id": body.qr_code_id, "status": "Clean / Ready for Filling"})
        if already:
            raise HTTPException(status_code=400, detail="This bin is already marked clean.")
        raise HTTPException(status_code=400, detail="Scanned QR does not match any bin pending cleaning.")
    await _mark_bin_clean(item, user["username"], user["role"], "QR scan")
    return {"message": "Bin scanned and marked clean.", "bin_id": item["bin_id"], "return_id": item["id"]}


@router.post("/cleaning-bins/{return_id}/advance")
async def advance_cleaning(return_id: str, user: dict = Depends(require_roles(*ANY_KITCHEN))):
    item = await db.dirty_bin_returns.find_one({"id": return_id})
    if not item:
        raise HTTPException(status_code=404, detail="Record not found")
    current_stage = item.get("status", CLEANING_LIFECYCLE[0])
    idx = CLEANING_LIFECYCLE.index(current_stage) if current_stage in CLEANING_LIFECYCLE else 0
    if idx >= len(CLEANING_LIFECYCLE) - 1:
        raise HTTPException(status_code=400, detail="Bin is already Clean / Ready for Filling")
    next_stage = CLEANING_LIFECYCLE[idx + 1]
    update = {"status": next_stage}
    if next_stage == "Clean / Ready for Filling":
        await db.bin_storage.update_one({"id": item["bin_id"]}, {"$set": {
            "status": "Clean / Ready for Filling", "previous_ingredient_code": item.get("ingredient_code"),
            "current_ingredient_code": None, "last_cleaned_date": now_iso(), "location": "Kitchen Storage",
        }})
        await push_progress("dirty_bin_return", return_id, item["machine_id"], "Kitchen Cleaning Completed", by=user["username"])
    await db.dirty_bin_returns.update_one({"id": return_id}, {"$set": update})
    await log_activity(user["username"], user["role"], "Advanced cleaning stage", {"return_id": return_id, "stage": next_stage})
    return {"message": f"Advanced to {next_stage}", "stage": next_stage}


@router.post("/cleaning-bins/{return_id}/complete")
async def complete_cleaning(return_id: str, user: dict = Depends(require_roles(*ANY_KITCHEN))):
    """One-click completion: performs the full cleaning lifecycle and marks the bin Clean / Ready for Filling."""
    item = await db.dirty_bin_returns.find_one({"id": return_id})
    if not item:
        raise HTTPException(status_code=404, detail="Record not found")
    if item.get("status") == "Clean / Ready for Filling":
        raise HTTPException(status_code=400, detail="This bin is already marked clean.")
    await _mark_bin_clean(item, user["username"], user["role"], "one-click complete")
    return {"message": f"{item['ingredient_name']} bin marked Clean / Ready for Filling", "stage": "Clean / Ready for Filling"}


@router.get("/notifications")
async def kitchen_notifications(user: dict = Depends(get_current_user)):
    items = await db.notifications.find({"$or": [
        {"target_role": "kitchen_staff"}, {"target_username": user["username"]},
    ]}).sort("created_at", -1).to_list(200)
    return serialize_list(items)
