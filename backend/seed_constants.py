"""Static reference / seed data for the Protein Hulk Maintenance App.
This file holds the raw specification data (machines, ingredients, recipes,
users, checklists, stages) exactly as provided in the product spec.
Do NOT change recipe values or "correct" unusual values.
"""

# ---------------------------------------------------------------------------
# Machines
# ---------------------------------------------------------------------------
MACHINES = [
    {"id": "M001", "location": "Gachibowli", "status": "Running", "assigned_operations_staff": "operations01"},
    {"id": "M002", "location": "Hitech City", "status": "Warning", "assigned_operations_staff": "operations01"},
    {"id": "M003", "location": "Jubilee Hills", "status": "Running", "assigned_operations_staff": "operations01"},
    {"id": "M004", "location": "Kondapur", "status": "Warning", "assigned_operations_staff": "operations02"},
    {"id": "M005", "location": "Financial District", "status": "Running", "assigned_operations_staff": "operations02"},
]


def machine_label(machine_id: str) -> str:
    for m in MACHINES:
        if m["id"] == machine_id:
            return f"{m['id']} \u2013 {m['location']}"
    return machine_id


MACHINE_LOCATION = {m["id"]: m["location"] for m in MACHINES}

# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------
USERS_SEED = [
    {"username": "kitchen01", "password": "1234", "role": "kitchen_staff", "name": "Rakesh Kumar", "email": "kitchen01@proteinhulk.com", "assigned_machines": []},
    {"username": "operations01", "password": "1234", "role": "operations_staff", "name": "Anil Verma", "email": "operations01@proteinhulk.com", "assigned_machines": ["M001", "M002", "M003"]},
    {"username": "operations02", "password": "1234", "role": "operations_staff", "name": "Suresh Reddy", "email": "operations02@proteinhulk.com", "assigned_machines": ["M004", "M005"]},
    {"username": "operations_sup01", "password": "1234", "role": "operations_supervisor", "name": "Priya Sharma", "email": "ops_sup@proteinhulk.com", "assigned_machines": []},
    {"username": "tech01", "password": "1234", "role": "maintenance_technician", "name": "Vikram Singh", "email": "tech01@proteinhulk.com", "assigned_machines": []},
    {"username": "maintenance_sup01", "password": "1234", "role": "maintenance_supervisor", "name": "Ravi Patel", "email": "maint_sup@proteinhulk.com", "assigned_machines": []},
    {"username": "admin01", "password": "1234", "role": "admin", "name": "System Admin", "email": "admin@proteinhulk.com", "assigned_machines": []},
]

ROLE_LABELS = {
    "kitchen_staff": "Kitchen Staff",
    "operations_staff": "Operations Staff",
    "operations_supervisor": "Operations Supervisor",
    "maintenance_technician": "Maintenance Technician",
    "maintenance_supervisor": "Maintenance Supervisor",
    "admin": "Admin",
}

# ---------------------------------------------------------------------------
# Ingredients (code, name, unit, category)
# ---------------------------------------------------------------------------
LIQUIDS = [
    ("L1", "Coconut Milk", "ml"), ("L2", "Almond Milk", "ml"), ("L3", "Soy Milk", "ml"),
    ("L4", "Pomegranate Juice", "ml"), ("L5", "Honey", "gm"), ("L6", "Vanilla Extract", "ml"),
    ("L7", "Almond Roca Syrup", "ml"), ("L8", "Coconut Syrup", "ml"), ("L9", "Cashewnut Cream", "gm"),
    ("L10", "Yogurt", "gm"), ("WATER", "Water", "ml"),
]
POWDERS = [
    ("P1", "Vanilla Protein Powder", "gm"), ("P2", "Strawberry Protein Powder", "gm"),
    ("P3", "Coco Frappe Powder", "gm"), ("P4", "Vanilla Frappe Powder", "gm"), ("P5", "Matcha Powder", "gm"),
    ("P6", "Spirulina Blue", "gm"), ("P7", "Spirulina Green", "gm"), ("P8", "Acai Powder", "gm"),
    ("P9", "Beetroot Powder", "gm"), ("P10", "Watermelon Juice Powder", "gm"),
]
SOLIDS = [
    ("S1", "Green Apple", "gm"), ("S2", "Peach", "gm"), ("S3", "Banana", "gm"),
    ("S4", "Goji Berries Soaked", "gm"), ("S5", "Mango", "gm"), ("S6", "Pineapple", "gm"),
    ("S7", "Raspberry", "gm"), ("S8", "Strawberry", "gm"), ("S9", "Blueberry", "gm"), ("S10", "Dragon Fruit", "gm"),
]
OTHERS = [
    ("ICE", "Ice Bin", "gm"), ("CAN", "Cup Dispenser", "cups"), ("LID", "Lid Dispenser", "pcs"),
    ("WC1", "Water Can WC1", "L"), ("WC2", "Water Can WC2", "L"), ("SN1", "Sanitizer SN1", "L"),
    ("WWC1", "Waste Water Can WWC1", "L"), ("WWC2", "Waste Water Can WWC2", "L"), ("WWC3", "Waste Water Can WWC3", "L"),
]

CATEGORY_OF = {}
for code, name, unit in LIQUIDS:
    CATEGORY_OF[code] = "Liquid"
for code, name, unit in POWDERS:
    CATEGORY_OF[code] = "Powder"
for code, name, unit in SOLIDS:
    CATEGORY_OF[code] = "Solid"
for code, name, unit in OTHERS:
    CATEGORY_OF[code] = "Other"

ALL_INGREDIENTS = LIQUIDS + POWDERS + SOLIDS + OTHERS
INGREDIENT_NAME = {c: n for c, n, u in ALL_INGREDIENTS}
INGREDIENT_UNIT = {c: u for c, n, u in ALL_INGREDIENTS}

CUPS_PER_REFILL = 120

# ---------------------------------------------------------------------------
# Recipe Master - exact spec data, do not modify values
# ---------------------------------------------------------------------------
RECIPES = [
    {"no": 1, "name": "Green Apple Blue Spirulina", "ingredients": {"L2": 80, "L5": 12, "L6": 4, "L9": 16, "WATER": 40, "P1": 20, "P6": 0.01, "S1": 80, "ICE": 100}},
    {"no": 2, "name": "Peach Protein Smoothie", "ingredients": {"L6": 7, "L10": 110, "WATER": 55, "P1": 18, "S2": 103, "ICE": 55}},
    {"no": 3, "name": "Classic Chocolate Shake", "ingredients": {"L1": 218, "P1": 16, "P3": 15, "ICE": 101}},
    {"no": 4, "name": "Matcha Protein Shake", "ingredients": {"L1": 210, "L5": 4, "P1": 19, "P3": 15, "P5": 1.5, "ICE": 103}},
    {"no": 5, "name": "Goji Berry Protein Shake", "ingredients": {"L1": 123, "L9": 16, "WATER": 66, "P1": 20, "S4": 25, "S8": 16, "ICE": 82}},
    {"no": 6, "name": "Berry Protein Shake", "ingredients": {"L5": 5, "L10": 95, "WATER": 127, "P1": 16, "S8": 19, "S9": 63, "S10": 25}},
    {"no": 7, "name": "Almond Roca Green Spirulina", "ingredients": {"L7": 30, "WATER": 34, "P1": 25, "P7": 0.01, "ICE": 210}},
    {"no": 8, "name": "Strawberry Banana Pom", "ingredients": {"L4": 80, "WATER": 121, "P1": 21, "P2": 10, "S3": 40, "ICE": 81}},
    {"no": 9, "name": "Berry Spirulina Smoothie", "ingredients": {"L3": 54, "WATER": 54, "P1": 14, "P7": 0.01, "S7": 12, "S8": 12, "S9": 12, "ICE": 124}},
    {"no": 10, "name": "Matcha with Green Queen", "ingredients": {"L1": 240, "L5": 5, "L8": 10, "P1": 24, "P3": 18, "P5": 2, "ICE": 59}},
    {"no": 11, "name": "Sunshine Mango Blast", "ingredients": {"L1": 150, "WATER": 70, "P1": 20, "S5": 60, "S6": 30}},
    {"no": 12, "name": "Pink Dragon Fruit Glow", "ingredients": {"WATER": 50, "P1": 160, "S8": 20, "S10": 80}},
    {"no": 13, "name": "Tropical Acai Energy", "ingredients": {"L4": 100, "WATER": 145, "P8": 5, "S5": 40, "S10": 40}},
    {"no": 14, "name": "Golden Pineapple Kick", "ingredients": {"L1": 160, "WATER": 35, "P1": 20, "P3": 15, "S5": 30, "S6": 70}},
    {"no": 15, "name": "Watermelon Apple Crisp", "ingredients": {"L2": 150, "WATER": 50, "P1": 20, "S1": 10, "S3": 100}},
    {"no": 16, "name": "Berry Beet Detox", "ingredients": {"L3": 150, "WATER": 97, "P1": 20, "P9": 3, "S7": 30, "S9": 30}},
    {"no": 17, "name": "Exotic Sunset Shake", "ingredients": {"L8": 10, "WATER": 225, "P1": 20, "S5": 15, "S6": 60}},
    {"no": 18, "name": "Purple Rain Protein", "ingredients": {"L1": 120, "WATER": 95, "P1": 20, "P8": 5, "S8": 50, "S9": 40}},
    {"no": 19, "name": "Watermelon Dream", "ingredients": {"L1": 180, "WATER": 75, "P1": 20, "S1": 15, "S5": 40}},
    {"no": 20, "name": "Ruby Refresher", "ingredients": {"L4": 80, "WATER": 146, "P1": 20, "P9": 4, "S7": 40, "S8": 40}},
]


def compute_max_usage():
    """Highest quantity used by each ingredient in any one drink recipe."""
    max_usage = {}
    for recipe in RECIPES:
        for code, qty in recipe["ingredients"].items():
            if qty > max_usage.get(code, 0):
                max_usage[code] = qty
    return max_usage


def recipes_using(code: str):
    return [r["name"] for r in RECIPES if code in r["ingredients"]]


def humanize_qty(qty: float, unit: str) -> str:
    if unit == "ml" and qty >= 1000:
        return f"{qty:,.0f} ml / {round(qty/1000, 2):g} L"
    if unit == "gm" and qty >= 1000:
        return f"{qty:,.0f} gm / {round(qty/1000, 2):g} kg"
    if isinstance(qty, float) and qty < 1:
        return f"{qty:,.2f} {unit}"
    return f"{qty:,.0f} {unit}"


# ---------------------------------------------------------------------------
# Cleaning checklist (Operations Staff - Cleaning & Sanitization)
# ---------------------------------------------------------------------------
CLEANING_STEPS = [
    "Serving Counter / Cup Placement Area",
    "Can Dispensing Mesh",
    "Under Can Dispensing Mesh",
    "Drink Dispensing Mesh",
    "Under Drink Dispensing Mesh",
    "Drink Nozzle / Outlet Area",
    "Blending Area",
    "Blender Jar / Blender Unit Cleaning",
    "CIP",
    "Drip Tray",
    "Waste Collection Area",
    "Bin Slot Area",
    "Machine Door Inner Surface",
]

DOORS = ["Right Door", "Left Door", "Back Door"]

# CIP (Cleaning In Place): hot-water flush lines
CIP_LINES = [
    ("L1", "Run Hot Water Through Liquid Line L1"), ("L2", "Run Hot Water Through Liquid Line L2"),
    ("L3", "Run Hot Water Through Liquid Line L3"), ("L4", "Run Hot Water Through Liquid Line L4"),
    ("L5", "Run Hot Water Through Liquid Line L5"), ("L6", "Run Hot Water Through Liquid Line L6"),
    ("L7", "Run Hot Water Through Liquid Line L7"), ("L8", "Run Hot Water Through Liquid Line L8"),
    ("L9", "Run Hot Water Through Liquid Line L9"), ("L10", "Run Hot Water Through Liquid Line L10"),
    ("L11", "Run Hot Water Through Water Line / L11"),
]

# ---------------------------------------------------------------------------
# Workflow stages (used across live_task_progress / timelines)
# ---------------------------------------------------------------------------
STAGES = [
    "Alert Created", "Alert Reviewed by Supervisor", "Operations Staff Assigned",
    "Kitchen Fill Ticket Created", "Kitchen Preparation Started", "Bin QR Scanned by Kitchen",
    "Bin Filled and Saved", "Ready for Pickup", "Door Opened", "Pickup List Opened",
    "Bin QR Scanned for Pickup", "All Scheduled Items Picked", "Loaded on Trolley",
    "Reached Machine", "Old Bin Removed", "New Bin QR Scanned", "Slot QR Scanned",
    "New Bin Placed in Machine", "Removed Old Bin QR Scanned", "Dirty Bin Added to Return",
    "Dirty Bin Returned to Kitchen", "Kitchen Cleaning Completed", "Cleaning Completed",
    "QR Scan Corrected", "Supervisor Reviewed", "Closed",
]

# ---------------------------------------------------------------------------
# Spare parts master
# ---------------------------------------------------------------------------
SPARE_PARTS = [
    {"name": "Blending Motor", "unit": "pcs", "stock": 8, "reorder_level": 3, "unit_cost": 4200},
    {"name": "Peristaltic Pump", "unit": "pcs", "stock": 12, "reorder_level": 4, "unit_cost": 1800},
    {"name": "Solenoid Valve", "unit": "pcs", "stock": 20, "reorder_level": 6, "unit_cost": 650},
    {"name": "Nozzle Head", "unit": "pcs", "stock": 25, "reorder_level": 8, "unit_cost": 300},
    {"name": "Door Hinge Kit", "unit": "pcs", "stock": 6, "reorder_level": 3, "unit_cost": 950},
    {"name": "Touchscreen Panel", "unit": "pcs", "stock": 3, "reorder_level": 2, "unit_cost": 9800},
    {"name": "Ice Auger Motor", "unit": "pcs", "stock": 5, "reorder_level": 2, "unit_cost": 3400},
    {"name": "Cup Dispenser Belt", "unit": "pcs", "stock": 14, "reorder_level": 5, "unit_cost": 420},
    {"name": "Temperature Sensor", "unit": "pcs", "stock": 18, "reorder_level": 5, "unit_cost": 280},
    {"name": "Mixing Blade Set", "unit": "pcs", "stock": 9, "reorder_level": 4, "unit_cost": 1100},
]

# ---------------------------------------------------------------------------
# Report catalogue
# ---------------------------------------------------------------------------
OPERATIONS_REPORTS = [
    ("sales", "Sales"), ("machine_sales", "Machine Sales"), ("ingredient_consumption", "Ingredient Consumption"),
    ("low_stock", "Low Stock"), ("bin_replacement", "Bin Replacement"), ("staff_productivity", "Staff Productivity"),
    ("cleaning_compliance", "Cleaning Compliance"), ("dirty_bin_lifecycle", "Dirty Bin Lifecycle"), ("user_activity", "User Activity"),
]
MAINTENANCE_REPORTS = [
    ("work_order_summary", "Work Order Summary"), ("machine_downtime", "Machine Downtime"),
    ("pm_compliance", "Preventive Maintenance Compliance"), ("technician_productivity", "Technician Productivity"),
    ("spare_parts_usage", "Spare Parts Usage"), ("repeated_failure", "Repeated Failure"),
    ("machine_health_score", "Machine Health Score"), ("repair_turnaround", "Repair Turnaround Time"),
]

DRINK_NAMES = [r["name"] for r in RECIPES]
