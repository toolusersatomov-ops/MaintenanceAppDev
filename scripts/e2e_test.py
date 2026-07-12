"""
End-to-end smoke test for the Protein Hulk (tare) Maintenance App.
Exercises the full supervisor -> kitchen -> operations pipeline against the
live backend API and prints PASS/FAIL for each step.

Usage:
    python3 /app/scripts/e2e_test.py
"""
import os
import sys
import requests

API_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not API_URL:
    # fall back to reading frontend/.env directly
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                API_URL = line.strip().split("=", 1)[1]
                break
BASE = f"{API_URL}/api"

results = []


def step(name, fn):
    try:
        out = fn()
        results.append((name, True, ""))
        print(f"PASS  - {name}")
        return out
    except Exception as e:
        results.append((name, False, str(e)))
        print(f"FAIL  - {name}: {e}")
        return None


def login(username, password):
    r = requests.post(f"{BASE}/auth/login", json={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def main():
    admin_token = step("0. Admin login + reset mock data (clean slate)", lambda: login("admin01", "1234"))
    if admin_token:
        step("0b. Reset and reseed mock data", lambda: requests.post(f"{BASE}/admin/mock-data/reset", headers=auth(admin_token)).raise_for_status() or {"ok": True})

    sup_token = step("1. Supervisor login (operations_sup01)", lambda: login("operations_sup01", "1234"))
    if not sup_token:
        print_summary()
        return

    # 2. Find an Open alert (or ensure one exists on a known slot)
    def get_or_ensure_alert():
        r = requests.get(f"{BASE}/alerts?status=Open", headers=auth(sup_token))
        r.raise_for_status()
        alerts = r.json()
        if alerts:
            return alerts[0]
        r = requests.post(f"{BASE}/alerts/ensure", headers=auth(sup_token), json={"machine_id": "M003", "slot_id": "M003-P2"})
        r.raise_for_status()
        alert_id = r.json()["id"]
        r = requests.get(f"{BASE}/alerts/{alert_id}", headers=auth(sup_token))
        r.raise_for_status()
        return r.json()

    alert = step("2. Get/ensure an Open alert", get_or_ensure_alert)
    if not alert:
        print_summary()
        return
    alert_id = alert["id"]
    machine_id = alert["machine_id"]

    # 3. Assign and Create Kitchen Ticket -> creates bin_replacement_task + pickup_task + kitchen_prep_request
    def assign_and_create():
        r = requests.post(f"{BASE}/alerts/{alert_id}/assign", headers=auth(sup_token),
                           json={"operations_staff": "operations01", "create_kitchen_ticket": True})
        r.raise_for_status()
        return r.json()

    result = step("3. Assign and Create Kitchen Ticket", assign_and_create)
    if not result:
        print_summary()
        return
    pickup_task_id = result["pickup_task_id"]
    kpr_id = result["kitchen_prep_request_id"]

    # 4. operations01 login, verify pickup task pending and pickup scan is blocked
    ops_token = step("4a. Operations Staff login (operations01)", lambda: login("operations01", "1234"))

    def check_pending():
        r = requests.get(f"{BASE}/operations/pickup-list?machine_id={machine_id}", headers=auth(ops_token))
        r.raise_for_status()
        tasks = r.json()
        task = next(t for t in tasks if t["id"] == pickup_task_id)
        assert task["status"] == "Pending Prep", f"expected Pending Prep, got {task['status']}"
        return task

    step("4b. Pickup task shows Pending Prep (awaiting kitchen)", check_pending)

    def scan_blocked():
        r = requests.post(f"{BASE}/operations/pickup-list/scan", headers=auth(ops_token),
                           json={"machine_id": machine_id, "qr_code_id": "some-placeholder-qr"})
        assert r.status_code == 400, "expected scan to be rejected before kitchen prep"
        return r.json()["detail"]

    step("4c. Pickup scan blocked before kitchen prep is ready", scan_blocked)

    # 5. kitchen01: start prep -> scan bin -> confirm clean -> save
    kitchen_token = step("5a. Kitchen Staff login (kitchen01)", lambda: login("kitchen01", "1234"))

    def start_prep():
        r = requests.post(f"{BASE}/kitchen/preparation-requests/{kpr_id}/start", headers=auth(kitchen_token))
        r.raise_for_status()
        return r.json()

    step("5b. Kitchen: Start Preparation", start_prep)

    def pick_bin():
        r = requests.get(f"{BASE}/kitchen/preparation-requests/{kpr_id}/bin-options", headers=auth(kitchen_token))
        r.raise_for_status()
        bins = r.json()
        assert bins, "no clean bins available in Kitchen Storage for this slot type"
        return bins[0]["id"]

    bin_id = step("5c. Kitchen: pick an available clean bin", pick_bin)

    def scan_bin():
        r = requests.post(f"{BASE}/kitchen/preparation-requests/{kpr_id}/scan-bin", headers=auth(kitchen_token), json={"bin_id": bin_id})
        r.raise_for_status()
        return r.json()

    scanned = step("5d. Kitchen: Scan Bin QR", scan_bin)

    def save_bin():
        r = requests.post(f"{BASE}/kitchen/preparation-requests/{kpr_id}/save-bin", headers=auth(kitchen_token), json={
            "bin_id": bin_id, "quantity": scanned["quantity"], "unit": scanned["unit"],
            "expiry_date": scanned["expiry_date"], "replacement_due_date": scanned["replacement_due_date"],
            "clean_confirmed": True,
        })
        r.raise_for_status()
        return r.json()

    step("5e. Kitchen: Confirm Clean + Save Bin (Ready for Pickup)", save_bin)

    # 6. Verify pickup task auto-transitioned to Ready for Pickup with bin+qr linked
    def check_ready():
        r = requests.get(f"{BASE}/operations/pickup-list?machine_id={machine_id}", headers=auth(ops_token))
        r.raise_for_status()
        task = next(t for t in r.json() if t["id"] == pickup_task_id)
        assert task["status"] == "Ready for Pickup", f"expected Ready for Pickup, got {task['status']}"
        assert task["bin_id"] and task["qr_code_id"], "bin/qr not linked to pickup task"
        return task

    pickup_task = step("6. Pickup task auto-transitioned to Ready for Pickup with bin linked", check_ready)
    if not pickup_task:
        print_summary()
        return

    # 7. operations01 scans + loads trolley
    def do_scan():
        r = requests.post(f"{BASE}/operations/pickup-list/scan", headers=auth(ops_token),
                           json={"machine_id": machine_id, "qr_code_id": pickup_task["qr_code_id"]})
        r.raise_for_status()
        return r.json()

    step("7a. Operations: Scan pickup bin (matches)", do_scan)

    def mark_all():
        r = requests.post(f"{BASE}/operations/pickup-list/mark-all", headers=auth(ops_token), json={"machine_id": machine_id})
        r.raise_for_status()
        return r.json()

    step("7b. Operations: Mark All Scheduled Items Picked (Loaded on Trolley)", mark_all)

    # 8. 6-step bin replacement flow
    brt_id = result["bin_replacement_task_id"]

    def scan_options():
        r = requests.get(f"{BASE}/operations/bin-replacement-tasks/{brt_id}/scan-options", headers=auth(ops_token))
        r.raise_for_status()
        return r.json()

    opts = step("8a. Get scan options (new bin / slot / old bin QR)", scan_options)

    def remove_old():
        r = requests.post(f"{BASE}/operations/bin-replacement-tasks/{brt_id}/remove-old", headers=auth(ops_token))
        r.raise_for_status()
        return r.json()

    step("8b. Remove Old Bin", remove_old)

    def scan_new():
        r = requests.post(f"{BASE}/operations/bin-replacement-tasks/{brt_id}/scan-new-bin", headers=auth(ops_token),
                           json={"qr_code_id": opts["new_bin"][0]["qr_code_id"]})
        r.raise_for_status()
        return r.json()

    step("8c. Scan New Bin QR", scan_new)

    def scan_slot():
        r = requests.post(f"{BASE}/operations/bin-replacement-tasks/{brt_id}/scan-slot", headers=auth(ops_token),
                           json={"qr_code_id": opts["slot"][0]["qr_code_id"]})
        r.raise_for_status()
        return r.json()

    step("8d. Scan Machine Slot QR (New Bin Placed)", scan_slot)

    def scan_old():
        r = requests.post(f"{BASE}/operations/bin-replacement-tasks/{brt_id}/scan-old-bin", headers=auth(ops_token),
                           json={"qr_code_id": opts["old_bin"][0]["qr_code_id"]})
        r.raise_for_status()
        return r.json()

    old_scan = step("8e. Scan Removed Old Bin QR (Dirty Bin created)", scan_old)

    def complete():
        r = requests.post(f"{BASE}/operations/bin-replacement-tasks/{brt_id}/complete", headers=auth(ops_token))
        r.raise_for_status()
        return r.json()

    step("8f. Submit Replacement Completed", complete)

    # 9. Verify slot refilled to 100%
    def check_slot():
        r = requests.get(f"{BASE}/catalog/machines/{machine_id}/slots", headers=auth(sup_token))
        r.raise_for_status()
        slot = next(s for s in r.json()["slots"] if s["id"] == alert["slot_id"])
        assert slot["current_level_pct"] == 100.0, f"expected 100%, got {slot['current_level_pct']}"
        assert slot["status"] == "Normal"
        return slot

    step("9. Slot refilled to 100% (level_pct=100, status=Normal)", check_slot)

    # 10. Dirty bin appears -> return to kitchen -> cleaning lifecycle
    dirty_bin_return_id = old_scan.get("dirty_bin_return_id") if old_scan else None

    def check_dirty_bin():
        r = requests.get(f"{BASE}/operations/dirty-bin-return?machine_id={machine_id}", headers=auth(ops_token))
        r.raise_for_status()
        items = r.json()
        assert any(d["id"] == dirty_bin_return_id for d in items), "dirty bin not found in return list"
        return items

    step("10a. Dirty bin appears in Dirty Bin Return list", check_dirty_bin)

    def return_to_kitchen():
        r = requests.post(f"{BASE}/operations/dirty-bin-return/scan", headers=auth(ops_token),
                           json={"machine_id": machine_id, "qr_code_id": old_scan["scan_action_id"] and opts["old_bin"][0]["qr_code_id"]})
        r.raise_for_status()
        return r.json()

    step("10b. Operations: Return Dirty Bin to Kitchen", return_to_kitchen)

    def check_kitchen_cleaning():
        r = requests.get(f"{BASE}/kitchen/cleaning-bins", headers=auth(kitchen_token))
        r.raise_for_status()
        payload = r.json()
        items = payload["items"] if isinstance(payload, dict) else payload
        assert any(d["id"] == dirty_bin_return_id for d in items), "dirty bin not visible in Kitchen Cleaning Bins"
        return items

    step("11a. Dirty bin visible in Kitchen Cleaning Bins", check_kitchen_cleaning)

    def advance_cleaning_all():
        last = None
        for _ in range(6):
            r = requests.post(f"{BASE}/kitchen/cleaning-bins/{dirty_bin_return_id}/advance", headers=auth(kitchen_token))
            if r.status_code == 400:
                break
            r.raise_for_status()
            last = r.json()
        return last

    step("11b. Advance bin through cleaning lifecycle to Clean / Ready for Filling", advance_cleaning_all)

    # 12. Supervisor Live Task Progress timeline + reports update
    def check_progress():
        r = requests.get(f"{BASE}/supervisor/live-task-progress?machine_id={machine_id}", headers=auth(sup_token))
        r.raise_for_status()
        items = r.json()
        entry = next((i for i in items if i["ref_id"] == brt_id or i["ref_id"] == alert_id), None)
        assert entry, "no live progress timeline entry found for this task"
        assert len(entry["history"]) >= 5, f"expected a rich timeline, got {len(entry['history'])} entries"
        return entry

    step("12a. Supervisor Live Task Progress shows timeline", check_progress)

    def check_reports():
        r = requests.get(f"{BASE}/reports/bin_replacement?machine_id={machine_id}", headers=auth(sup_token))
        r.raise_for_status()
        data = r.json()
        assert data["kpis"][1]["value"] >= 1, "expected at least 1 completed bin replacement in report"
        return data

    step("12b. Bin Replacement report reflects completed task", check_reports)

    print_summary()


def print_summary():
    print("\n" + "=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    print(f"SUMMARY: {passed}/{len(results)} steps passed")
    for name, ok, err in results:
        status = "PASS" if ok else "FAIL"
        print(f"  [{status}] {name}" + (f" -- {err}" if err else ""))
    print("=" * 60)
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
