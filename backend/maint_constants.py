"""Static reference data for the Maintenance Technician / Maintenance Supervisor modules.
Shared master data (machines, bins, slots, ingredients, units, users) lives in seed_constants.py
and is reused as-is: nothing here duplicates it.
"""

TOLERANCE_PCT = 5.0

# ---------------------------------------------------------------------------
# Work orders
# ---------------------------------------------------------------------------
WORK_TYPES = ["Breakdown", "Preventive Maintenance", "Calibration", "Part Replacement", "Inspection", "Emergency Visit"]
PRIORITIES = ["Low", "Medium", "High", "Critical"]

WO_STATUSES = [
    "Assigned", "Accepted", "In Transit", "Reached Machine", "Diagnosis Started",
    "Diagnosis Completed", "Repair In Progress", "Waiting for Parts", "Testing",
    "Pending Supervisor Review", "Completed", "Closed",
]

# action -> (new_status, timeline stage)
WO_ACTIONS = {
    "Accept": ("Accepted", "Technician Accepted"),
    "Start Travel": ("In Transit", "In Transit"),
    "Reached Machine": ("Reached Machine", "Reached Machine"),
    "Start Diagnosis": ("Diagnosis Started", "Diagnosis Started"),
    "Complete Diagnosis": ("Diagnosis Completed", "Diagnosis Completed"),
    "Start Repair": ("Repair In Progress", "Repair Started"),
    "Start Testing": ("Testing", "Calibration / Testing"),
    "Submit for Supervisor Review": ("Pending Supervisor Review", "Submitted for Supervisor Review"),
}

TIMELINE_STAGES = [
    "Technical Alert Created", "Work Order Created", "Technician Assigned", "Technician Accepted",
    "In Transit", "Reached Machine", "Machine QR Verified", "Diagnosis Started", "Diagnosis Completed",
    "Repair Started", "Waiting for Parts", "Part Issued", "Repair Completed", "Calibration / Testing",
    "Submitted for Supervisor Review", "Supervisor Reviewed", "Closed",
]

FLAG_REASONS = [
    "Need Part From Warehouse", "Part Not Available", "Additional Technical Support Required",
    "Machine Inaccessible", "Safety Issue", "Additional Failure Found", "Other",
]

ESCALATION_REASONS = [
    "Critical Machine Down", "Part Unavailable", "Safety Issue", "Repair Overdue",
    "Repeated Failure", "Additional Technical Support", "Failed Repair", "Failed Calibration",
]

# ---------------------------------------------------------------------------
# Technical alerts
# ---------------------------------------------------------------------------
# alert type -> (component, error_code, default severity, suggested action)
ALERT_TYPE_MASTER = {
    "Machine Down": ("Controller", "E-CTRL-00", "Critical", "Dispatch technician immediately and create a Breakdown work order."),
    "Power Failure": ("Power", "E-PWR-01", "Critical", "Check main power supply and internal SMPS before restarting the machine."),
    "Connectivity Failure": ("Connectivity", "E-NET-02", "High", "Verify router/SIM connectivity and controller network module."),
    "Controller Failure": ("Controller", "E-CTRL-03", "Critical", "Run controller board diagnostics and replace if unresponsive."),
    "Cooling Failure": ("Cooling", "E-COOL-04", "Critical", "Inspect compressor, gas pressure and temperature sensors."),
    "Pump Failure": ("Pump", "E-PUMP-05", "High", "Run pump diagnostics, check for dry running and replace peristaltic pump if required."),
    "Solenoid Failure": ("Valve", "E-SOL-06", "High", "Test solenoid ON/OFF response and replace the valve if stuck."),
    "Motor Failure": ("Motor", "E-MOT-07", "High", "Check motor current draw and replace the motor if overheating."),
    "Blender Failure": ("Blender", "E-BLD-08", "High", "Inspect blender coupling, blade set and drive motor."),
    "Robotic Arm Failure": ("Robotic Arm", "E-ARM-09", "High", "Home the robotic arm, check axis limits and encoder feedback."),
    "Gripper Failure": ("Gripper", "E-GRP-10", "Medium", "Test gripper open/close cycles and check pneumatic/servo actuator."),
    "Door Lock Failure": ("Door", "E-DRL-11", "Medium", "Inspect door lock actuator and replace the hinge/lock kit if worn."),
    "Door Sensor Failure": ("Sensor", "E-DRS-12", "Medium", "Test door sensor state and re-align or replace the sensor."),
    "QR Scanner Failure": ("Display", "E-QRS-13", "Medium", "Clean scanner lens and verify camera module connectivity."),
    "Display Failure": ("Display", "E-DSP-14", "Medium", "Check display ribbon connection and replace touchscreen panel if dead."),
    "Payment Device Failure": ("Payment Device", "E-PAY-15", "High", "Restart payment terminal and verify network handshake."),
    "Sensor Failure": ("Sensor", "E-SEN-16", "Medium", "Identify faulty sensor via diagnostics and replace."),
    "Dispenser Jam": ("Other", "E-JAM-17", "High", "Clear the jam, inspect auger/mesh and run a dispense test."),
    "Cup Dispenser Failure": ("Cup Dispenser", "E-CUP-18", "Medium", "Inspect cup dispenser belt and drop sensor."),
    "Can Dispenser Failure": ("Can Dispenser", "E-CAN-19", "Medium", "Inspect can dispenser mechanism and drop sensor."),
    "Lid Dispenser Failure": ("Lid Dispenser", "E-LID-20", "Low", "Inspect lid dispenser stack and pusher assembly."),
    "Temperature Fault": ("Cooling", "E-TMP-21", "High", "Verify temperature sensor reading against reference thermometer."),
    "Calibration Failure": ("Other", "E-CAL-22", "High", "Recalibrate the affected slot / line and record the result."),
    "PM Due": ("Other", "E-PM-23", "Low", "Schedule the preventive maintenance visit for this machine."),
    "PM Overdue": ("Other", "E-PM-24", "High", "Assign the overdue preventive maintenance immediately."),
    "Repeated Failure": ("Other", "E-REP-25", "High", "Review service history and plan a root-cause fix or component replacement."),
}
ALERT_TYPES = list(ALERT_TYPE_MASTER.keys())
SEVERITIES = ["Low", "Medium", "High", "Critical"]

# ---------------------------------------------------------------------------
# Diagnostics — (component, component_id, expected value, error code)
# ---------------------------------------------------------------------------
DIAGNOSTIC_CHECKS = [
    ("Main Power Supply", "PWR-MAIN", "230 V \u00b110%", "E-PWR-01"),
    ("Internal Power Supply", "PWR-SMPS", "24 V \u00b15%", "E-PWR-02"),
    ("Network / Internet", "NET-01", "Online, < 200 ms", "E-NET-02"),
    ("Controller Board", "CTRL-01", "Responding, no fault flags", "E-CTRL-03"),
    ("Temperature Sensor", "TMP-01", "2 \u2013 6 \u00b0C", "E-TMP-21"),
    ("Cooling / Compressor", "COOL-01", "Running, 4 \u00b0C set point", "E-COOL-04"),
    ("Pumps", "PUMP-L1-L10", "All pumps prime within 3 s", "E-PUMP-05"),
    ("Solenoid Valves", "SOL-01", "Actuates within 500 ms", "E-SOL-06"),
    ("Motors", "MOT-01", "No overcurrent, < 2.5 A", "E-MOT-07"),
    ("Blender", "BLD-01", "18000 RPM \u00b15%", "E-BLD-08"),
    ("Robotic Arm", "ARM-01", "Homes on all axes", "E-ARM-09"),
    ("Gripper", "GRP-01", "Open/close in 1 s", "E-GRP-10"),
    ("Load Cells", "LC-01", "Zero \u00b12 g", "E-LC-26"),
    ("Door Locks", "DRL-01", "Locks and confirms", "E-DRL-11"),
    ("Door Sensors", "DRS-01", "Reports Open/Closed correctly", "E-DRS-12"),
    ("QR Scanner / Camera", "QRS-01", "Reads test QR in < 1 s", "E-QRS-13"),
    ("Display Screen", "DSP-01", "No dead pixels, touch OK", "E-DSP-14"),
    ("Payment Device", "PAY-01", "Test txn approved", "E-PAY-15"),
    ("Cup Dispenser", "CUP-01", "Single cup per cycle", "E-CUP-18"),
    ("Can Dispenser", "CAN-01", "Single can per cycle", "E-CAN-19"),
    ("Lid Dispenser", "LID-01", "Single lid per cycle", "E-LID-20"),
    ("Liquid Dispensers", "DISP-LIQ", "\u00b15% of target volume", "E-DISP-27"),
    ("Powder Dispensers", "DISP-POW", "\u00b15% of target weight", "E-DISP-28"),
    ("Solid Dispensers", "DISP-SOL", "\u00b15% of target weight", "E-DISP-29"),
    ("Ice Dispenser", "DISP-ICE", "\u00b15% of target weight", "E-DISP-30"),
    ("Waste Water Sensors", "WWS-01", "Level reported correctly", "E-SEN-16"),
    ("Water Level Sensors", "WLS-01", "Level reported correctly", "E-SEN-16"),
    ("Sanitizer Sensor", "SNS-01", "Level reported correctly", "E-SEN-16"),
    ("Nozzle / Outlet", "NOZ-01", "Free flow, no drip", "E-JAM-17"),
    ("Safety Interlock", "SAF-01", "Cuts power on door open", "E-SAF-31"),
]
DIAGNOSTIC_STATUSES = ["Pass", "Warning", "Fail"]

# ---------------------------------------------------------------------------
# Breakdown repair
# ---------------------------------------------------------------------------
COMPONENT_CATEGORIES = [
    "Power", "Connectivity", "Controller", "Cooling", "Pump", "Valve", "Motor", "Blender",
    "Robotic Arm", "Gripper", "Door", "Display", "Payment Device", "Cup Dispenser",
    "Can Dispenser", "Lid Dispenser", "Sensor", "Nozzle", "Other",
]

# ---------------------------------------------------------------------------
# Component testing
# ---------------------------------------------------------------------------
INPUT_TESTS = [
    "Temperature Sensor", "Load Cell", "Door Sensor", "Water Level Sensor",
    "Waste Water Sensor", "Sanitizer Sensor", "Connectivity", "Camera / QR Scanner",
]
OUTPUT_TESTS = [
    ("Pump", "ON / OFF"), ("Solenoid", "ON / OFF"), ("Motor", "ON / OFF"),
    ("Blender", "Start / Stop"), ("Gripper", "Open / Close"), ("Robotic Arm", "Run Test"),
    ("Liquid Dispenser", "Dispense Test"), ("Powder Dispenser", "Dispense Test"),
    ("Solid Dispenser", "Dispense Test"), ("Cup Dispenser", "Dispense Test"),
    ("Can Dispenser", "Dispense Test"), ("Lid Dispenser", "Dispense Test"),
    ("Ice Dispenser", "Dispense Test"),
]

# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------
CALIBRATION_TYPES = [
    "Liquid Volume Calibration",
    "Liquid Time-Based Calibration (Pump / Line)",
    "Powder Weight Calibration",
    "Solid Weight Calibration",
    "Ice Weight Calibration",
    "Load Cell Zero Check",
    "Load Cell 100 g Reference Check",
]

# ---------------------------------------------------------------------------
# Preventive maintenance — (step, requires_photo)
# ---------------------------------------------------------------------------
PM_CHECKLIST = [
    ("Machine Exterior", False), ("Doors / Locks", True), ("Electrical", False), ("Wiring", True),
    ("Controller", False), ("Internet / Network", False), ("Refrigeration", True), ("Compressor", True),
    ("Temperature Sensors", False), ("Pumps", True), ("Solenoids", True), ("Motors", True),
    ("Liquid Dispensers", True), ("Powder Dispensers", True), ("Solid Dispensers", True),
    ("Ice Dispenser", True), ("Blender", True), ("Robotic Arm", True), ("Gripper", True),
    ("Load Cells", False), ("QR Scanner", False), ("Display", False), ("Payment Device", False),
    ("Cup Dispenser", True), ("Can Dispenser", True), ("Lid Dispenser", True),
    ("Water System", True), ("Waste Water System", True), ("Sanitizer System", True),
    ("Safety Sensors", False), ("Final Operational Test", False),
]
PM_STEP_STATUSES = ["Not Started", "Pass", "Needs Attention", "Fail", "Completed"]
PM_TYPES = ["Routine PM", "Deep Service PM", "Refrigeration PM", "Dispensing System PM", "Safety PM"]
PM_FREQUENCIES = ["Daily", "Weekly", "Monthly", "Quarterly", "Custom"]
FREQUENCY_DAYS = {"Daily": 1, "Weekly": 7, "Monthly": 30, "Quarterly": 90, "Custom": 45}

# ---------------------------------------------------------------------------
# Spare parts master (part codes are maintenance-specific, not shared master data)
# ---------------------------------------------------------------------------
SPARE_PARTS_CATALOG = [
    {"part_code": "SP-MOT-001", "name": "Blending Motor", "category": "Motor", "total_stock": 8, "min_stock": 3, "unit_cost": 4200},
    {"part_code": "SP-PMP-002", "name": "Peristaltic Pump", "category": "Pump", "total_stock": 12, "min_stock": 4, "unit_cost": 1800},
    {"part_code": "SP-SOL-003", "name": "Solenoid Valve", "category": "Valve", "total_stock": 20, "min_stock": 6, "unit_cost": 650},
    {"part_code": "SP-NOZ-004", "name": "Nozzle Head", "category": "Nozzle", "total_stock": 25, "min_stock": 8, "unit_cost": 300},
    {"part_code": "SP-DOR-005", "name": "Door Hinge Kit", "category": "Door", "total_stock": 6, "min_stock": 3, "unit_cost": 950},
    {"part_code": "SP-DSP-006", "name": "Touchscreen Panel", "category": "Display", "total_stock": 3, "min_stock": 2, "unit_cost": 9800},
    {"part_code": "SP-ICE-007", "name": "Ice Auger Motor", "category": "Motor", "total_stock": 5, "min_stock": 2, "unit_cost": 3400},
    {"part_code": "SP-CUP-008", "name": "Cup Dispenser Belt", "category": "Cup Dispenser", "total_stock": 14, "min_stock": 5, "unit_cost": 420},
    {"part_code": "SP-TMP-009", "name": "Temperature Sensor", "category": "Sensor", "total_stock": 18, "min_stock": 5, "unit_cost": 280},
    {"part_code": "SP-BLD-010", "name": "Mixing Blade Set", "category": "Blender", "total_stock": 9, "min_stock": 4, "unit_cost": 1100},
    {"part_code": "SP-CTL-011", "name": "Controller Board", "category": "Controller", "total_stock": 4, "min_stock": 2, "unit_cost": 12500},
    {"part_code": "SP-SEN-012", "name": "Door Sensor", "category": "Sensor", "total_stock": 16, "min_stock": 6, "unit_cost": 350},
    {"part_code": "SP-LDC-013", "name": "Load Cell 5 kg", "category": "Sensor", "total_stock": 10, "min_stock": 4, "unit_cost": 890},
    {"part_code": "SP-GRP-014", "name": "Gripper Servo", "category": "Gripper", "total_stock": 7, "min_stock": 3, "unit_cost": 2400},
    {"part_code": "SP-PAY-015", "name": "Payment Terminal Module", "category": "Payment Device", "total_stock": 3, "min_stock": 2, "unit_cost": 7600},
]
PART_REQUEST_STATUSES = ["Requested", "Approved", "Rejected", "Issued", "Received", "Used"]
REPLACEMENT_REASONS = ["Worn Out", "Burnt / Electrical Failure", "Leakage", "Physical Damage",
                        "Intermittent Fault", "End of Life", "Preventive Replacement"]

# ---------------------------------------------------------------------------
# Doors / panels (technician service access)
# ---------------------------------------------------------------------------
PANELS = ["Right Door", "Left Door", "Back Door", "Service Panel"]

# ---------------------------------------------------------------------------
# Machine health
# ---------------------------------------------------------------------------
HEALTH_STATUSES = ["Healthy", "Warning", "Critical", "Down", "Under Maintenance"]


def health_status_for(score: int) -> str:
    if score >= 90:
        return "Healthy"
    if score >= 70:
        return "Warning"
    if score >= 40:
        return "Critical"
    return "Down"


MAINTENANCE_REPORT_LIST = [
    ("work_order_summary", "Work Order Summary"),
    ("machine_downtime", "Machine Downtime"),
    ("fault_frequency", "Fault Frequency"),
    ("repeated_failure", "Repeated Failure"),
    ("pm_compliance", "PM Compliance"),
    ("calibration_report", "Calibration Report"),
    ("technician_productivity", "Technician Productivity"),
    ("spare_parts_usage", "Spare Parts Usage"),
    ("repair_turnaround", "Repair Turnaround Time"),
    ("mttr", "Mean Time to Repair"),
    ("machine_health_score", "Machine Health"),
    ("component_failure", "Component Failure Report"),
]
