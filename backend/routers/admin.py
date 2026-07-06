from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict
from database import db, serialize, serialize_list
from auth_utils import get_current_user, require_roles, new_id, now_iso, ANY_ADMIN
from seed_constants import machine_label, OPERATIONS_REPORTS, MAINTENANCE_REPORTS
from utils import log_activity
from seed import reset_and_reseed

router = APIRouter(prefix="/api/admin", tags=["admin"])


async def _audit(username, role, action, details=None):
    await db.admin_audit_logs.insert_one({
        "id": new_id(), "username": username, "role": role, "action": action,
        "details": details or {}, "created_at": now_iso(),
    })


@router.get("/dashboard")
async def admin_dashboard(user: dict = Depends(require_roles(*ANY_ADMIN))):
    counts = {}
    for c in ["users", "machines", "alerts", "maintenance_work_orders", "technical_alerts",
              "kitchen_preparation_requests", "pickup_tasks", "bin_replacement_tasks", "sales_orders"]:
        counts[c] = await db[c].count_documents({})
    locked_users = await db.users.count_documents({"locked": True})
    open_alerts = await db.alerts.count_documents({"status": "Open"})
    open_wo = await db.maintenance_work_orders.count_documents({"status": {"$nin": ["Closed"]}})
    return {"collection_counts": counts, "locked_users": locked_users, "open_alerts": open_alerts, "open_work_orders": open_wo}


@router.get("/role-permissions")
async def get_role_permissions(user: dict = Depends(require_roles(*ANY_ADMIN))):
    items = await db.role_permissions.find().to_list(20)
    return serialize_list(items)


@router.put("/role-permissions/{role}")
async def update_role_permissions(role: str, body: dict, user: dict = Depends(require_roles(*ANY_ADMIN))):
    await db.role_permissions.update_one({"role": role}, {"$set": {"pages": body.get("pages", [])}}, upsert=True)
    await _audit(user["username"], user["role"], "Updated role permissions", {"role": role})
    return {"message": "Role permissions updated"}


class MachineBody(BaseModel):
    id: str
    location: str
    status: str = "Running"
    assigned_operations_staff: Optional[str] = None


@router.get("/machines")
async def admin_list_machines(user: dict = Depends(require_roles(*ANY_ADMIN))):
    items = await db.machines.find().sort("id", 1).to_list(200)
    return serialize_list(items)


@router.post("/machines")
async def admin_create_machine(body: MachineBody, user: dict = Depends(require_roles(*ANY_ADMIN))):
    doc = {**body.model_dump(), "label": f"{body.id} \u2013 {body.location}", "last_visit_time": None, "trolley_status": "Empty"}
    await db.machines.insert_one(doc)
    await _audit(user["username"], user["role"], "Created machine", {"machine_id": body.id})
    return serialize(doc)


@router.put("/machines/{machine_id}")
async def admin_update_machine(machine_id: str, body: dict, user: dict = Depends(require_roles(*ANY_ADMIN))):
    if "location" in body:
        body["label"] = f"{machine_id} \u2013 {body['location']}"
    await db.machines.update_one({"id": machine_id}, {"$set": body})
    await _audit(user["username"], user["role"], "Updated machine", {"machine_id": machine_id})
    return {"message": "Machine updated"}


@router.delete("/machines/{machine_id}")
async def admin_delete_machine(machine_id: str, user: dict = Depends(require_roles(*ANY_ADMIN))):
    await db.machines.delete_one({"id": machine_id})
    await _audit(user["username"], user["role"], "Deleted machine", {"machine_id": machine_id})
    return {"message": "Machine deleted"}


@router.get("/ingredients")
async def admin_list_ingredients(user: dict = Depends(require_roles(*ANY_ADMIN))):
    items = await db.ingredient_master.find().to_list(200)
    return serialize_list(items)


@router.put("/ingredients/{code}")
async def admin_update_ingredient(code: str, body: dict, user: dict = Depends(require_roles(*ANY_ADMIN))):
    await db.ingredient_master.update_one({"code": code}, {"$set": body})
    await _audit(user["username"], user["role"], "Updated ingredient", {"code": code})
    return {"message": "Ingredient updated"}


@router.get("/recipes")
async def admin_list_recipes(user: dict = Depends(require_roles(*ANY_ADMIN))):
    items = await db.recipe_master.find().sort("no", 1).to_list(200)
    return serialize_list(items)


@router.put("/recipes/{recipe_id}")
async def admin_update_recipe(recipe_id: str, body: dict, user: dict = Depends(require_roles(*ANY_ADMIN))):
    await db.recipe_master.update_one({"id": recipe_id}, {"$set": body})
    await _audit(user["username"], user["role"], "Updated recipe", {"recipe_id": recipe_id})
    return {"message": "Recipe updated"}


@router.get("/maintenance-master")
async def maintenance_master(user: dict = Depends(require_roles(*ANY_ADMIN))):
    items = await db.preventive_maintenance_schedules.find().to_list(200)
    return serialize_list(items)


@router.post("/maintenance-master")
async def create_maintenance_master(body: dict, user: dict = Depends(require_roles(*ANY_ADMIN))):
    doc = {"id": new_id(), "machine_id": body.get("machine_id"), "machine_label": machine_label(body.get("machine_id", "")),
           "checklist": body.get("checklist", []), "frequency_days": body.get("frequency_days", 90),
           "next_due_date": body.get("next_due_date"), "last_completed_date": None, "status": "Scheduled"}
    await db.preventive_maintenance_schedules.insert_one(doc)
    await _audit(user["username"], user["role"], "Created maintenance master entry", {"machine_id": body.get("machine_id")})
    return serialize(doc)


@router.put("/maintenance-master/{item_id}")
async def update_maintenance_master(item_id: str, body: dict, user: dict = Depends(require_roles(*ANY_ADMIN))):
    await db.preventive_maintenance_schedules.update_one({"id": item_id}, {"$set": body})
    return {"message": "Updated"}


@router.delete("/maintenance-master/{item_id}")
async def delete_maintenance_master(item_id: str, user: dict = Depends(require_roles(*ANY_ADMIN))):
    await db.preventive_maintenance_schedules.delete_one({"id": item_id})
    return {"message": "Deleted"}


@router.get("/spare-parts-master")
async def spare_parts_master(user: dict = Depends(require_roles(*ANY_ADMIN))):
    items = await db.spare_parts_inventory.find().sort("name", 1).to_list(200)
    return serialize_list(items)


@router.post("/spare-parts-master")
async def create_spare_part(body: dict, user: dict = Depends(require_roles(*ANY_ADMIN))):
    doc = {"id": new_id(), "name": body["name"], "unit": body.get("unit", "pcs"),
           "stock": body.get("stock", 0), "reorder_level": body.get("reorder_level", 1),
           "unit_cost": body.get("unit_cost", 0)}
    await db.spare_parts_inventory.insert_one(doc)
    await _audit(user["username"], user["role"], "Created spare part", {"name": body["name"]})
    return serialize(doc)


@router.put("/spare-parts-master/{part_id}")
async def update_spare_part(part_id: str, body: dict, user: dict = Depends(require_roles(*ANY_ADMIN))):
    await db.spare_parts_inventory.update_one({"id": part_id}, {"$set": body})
    return {"message": "Updated"}


@router.delete("/spare-parts-master/{part_id}")
async def delete_spare_part(part_id: str, user: dict = Depends(require_roles(*ANY_ADMIN))):
    await db.spare_parts_inventory.delete_one({"id": part_id})
    return {"message": "Deleted"}


@router.get("/reports-hub")
async def reports_hub(user: dict = Depends(require_roles(*ANY_ADMIN))):
    return {"operations_reports": OPERATIONS_REPORTS, "maintenance_reports": MAINTENANCE_REPORTS}


@router.get("/audit-logs")
async def audit_logs(username: Optional[str] = None, limit: int = 500, user: dict = Depends(require_roles(*ANY_ADMIN))):
    admin_query = {"username": username} if username else {}
    activity_query = {"username": username} if username else {}
    admin_items = await db.admin_audit_logs.find(admin_query).sort("created_at", -1).to_list(limit)
    activity_items = await db.activity_logs.find(activity_query).sort("created_at", -1).to_list(limit)
    for a in admin_items:
        a["source"] = "admin_audit_logs"
    for a in activity_items:
        a["source"] = "activity_logs"
    combined = serialize_list(admin_items) + serialize_list(activity_items)
    combined.sort(key=lambda x: x["created_at"], reverse=True)
    return combined[:limit]


@router.get("/system-settings")
async def get_system_settings(user: dict = Depends(require_roles(*ANY_ADMIN))):
    settings = await db.system_settings.find_one({"id": "system_settings"})
    return serialize(settings)


@router.put("/system-settings")
async def update_system_settings(body: dict, user: dict = Depends(require_roles(*ANY_ADMIN))):
    await db.system_settings.update_one({"id": "system_settings"}, {"$set": body})
    await _audit(user["username"], user["role"], "Updated system settings", body)
    return {"message": "System settings updated"}


@router.get("/mock-data/status")
async def mock_data_status(user: dict = Depends(require_roles(*ANY_ADMIN))):
    collections = await db.list_collection_names()
    counts = {c: await db[c].count_documents({}) for c in collections}
    return counts


@router.post("/mock-data/reset")
async def mock_data_reset(user: dict = Depends(require_roles(*ANY_ADMIN))):
    await reset_and_reseed()
    await _audit(user["username"], user["role"], "Reset and reseeded mock data", {})
    return {"message": "Mock data reset and reseeded successfully"}
