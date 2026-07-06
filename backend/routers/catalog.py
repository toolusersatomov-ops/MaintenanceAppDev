from fastapi import APIRouter, Depends
from database import db, serialize, serialize_list
from auth_utils import get_current_user

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/machines")
async def list_machines(user: dict = Depends(get_current_user)):
    machines = await db.machines.find().sort("id", 1).to_list(1000)
    return serialize_list(machines)


@router.get("/machines/{machine_id}")
async def get_machine(machine_id: str, user: dict = Depends(get_current_user)):
    m = await db.machines.find_one({"id": machine_id})
    return serialize(m)


@router.get("/machines/{machine_id}/slots")
async def machine_slots(machine_id: str, user: dict = Depends(get_current_user)):
    slots = await db.machine_slots.find({"machine_id": machine_id}).to_list(1000)
    slots = serialize_list(slots)
    grouped = {"Liquid": [], "Powder": [], "Solid": [], "Other": []}
    for s in slots:
        grouped.setdefault(s["slot_type"], []).append(s)
    return {"machine_id": machine_id, "slots": slots, "grouped": grouped}


@router.get("/ingredients")
async def list_ingredients(user: dict = Depends(get_current_user)):
    items = await db.ingredient_master.find().to_list(1000)
    return serialize_list(items)


@router.get("/recipes")
async def list_recipes(user: dict = Depends(get_current_user)):
    items = await db.recipe_master.find().sort("no", 1).to_list(1000)
    return serialize_list(items)
