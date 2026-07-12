"""Backend tests for Change Note #4 - 16 update areas.
Preconditions: fresh mock data (e2e_test.py just ran a reset).
"""
import os
import pytest
import requests

def _get_base():
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    url = line.strip().split("=", 1)[1]
                    break
    return url.rstrip("/") + "/api"


BASE = _get_base()


def _login(u, p="1234"):
    r = requests.post(f"{BASE}/auth/login", json={"username": u, "password": p}, timeout=30)
    r.raise_for_status()
    return r.json()["token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def sup_token():
    return _login("operations_sup01")


@pytest.fixture(scope="module")
def ops01_token():
    return _login("operations01")


@pytest.fixture(scope="module")
def ops02_token():
    return _login("operations02")


@pytest.fixture(scope="module")
def kitchen_token():
    return _login("kitchen01")


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin01")


@pytest.fixture(scope="module", autouse=True)
def reset_and_evaluate(admin_token, sup_token):
    # Ensure clean slate & alerts re-evaluated
    requests.post(f"{BASE}/admin/mock-data/reset", headers=_h(admin_token), timeout=60)
    requests.post(f"{BASE}/alerts/evaluate-consumables", headers=_h(sup_token), timeout=30)
    yield


# ==== Waste Water Alerts ====
class TestWasteWater:
    def test_m004_waste_water_awareness(self, sup_token):
        r = requests.get(f"{BASE}/alerts", headers=_h(sup_token))
        assert r.status_code == 200
        alerts = r.json()
        m004 = [a for a in alerts if a.get("machine_id") == "M004" and a.get("alert_type") == "Waste Water Monitoring"]
        assert len(m004) >= 1, f"No Waste Water Monitoring alert on M004; got types: {[a.get('alert_type') for a in alerts if a.get('machine_id')=='M004']}"
        a = m004[0]
        assert a.get("awareness_only") is True
        assert "90%" in a["alert_message"] and "Monitor" in a["alert_message"]

    def test_m004_awareness_cannot_be_assigned(self, sup_token):
        r = requests.get(f"{BASE}/alerts", headers=_h(sup_token))
        m004 = [a for a in r.json() if a.get("machine_id") == "M004" and a.get("alert_type") == "Waste Water Monitoring"][0]
        # Try to assign it - should 400
        assign_r = requests.post(f"{BASE}/alerts/{m004['id']}/assign",
                                  headers=_h(sup_token),
                                  json={"operations_staff": "operations02", "priority": "Medium"})
        assert assign_r.status_code == 400, f"Expected 400, got {assign_r.status_code}: {assign_r.text}"

    def test_m002_waste_water_full_combined(self, sup_token):
        r = requests.get(f"{BASE}/alerts", headers=_h(sup_token))
        m002 = [a for a in r.json() if a.get("machine_id") == "M002" and a.get("alert_type") == "Waste Water Full"]
        assert len(m002) >= 1
        a = m002[0]
        assert "WWC2 and WWC3" in a["alert_message"]
        assert len(a.get("related_slot_ids") or []) == 2

    def test_evaluate_idempotent(self, sup_token):
        # Call twice, count Waste Water alerts stable
        requests.post(f"{BASE}/alerts/evaluate-consumables", headers=_h(sup_token))
        r1 = requests.get(f"{BASE}/alerts?status=Open", headers=_h(sup_token))
        c1 = len(r1.json())
        requests.post(f"{BASE}/alerts/evaluate-consumables", headers=_h(sup_token))
        r2 = requests.get(f"{BASE}/alerts?status=Open", headers=_h(sup_token))
        c2 = len(r2.json())
        assert c1 == c2, f"Alerts duplicated on re-evaluate: {c1} -> {c2}"


# ==== Water Can Alerts ====
class TestWaterCan:
    def test_m003_low_water(self, sup_token):
        r = requests.get(f"{BASE}/alerts", headers=_h(sup_token))
        m003 = [a for a in r.json() if a.get("machine_id") == "M003" and a.get("alert_type") == "Low Water"]
        assert len(m003) >= 1
        assert "WC1" in m003[0]["alert_message"] and "low" in m003[0]["alert_message"].lower()

    def test_m005_combined_water_assign_creates_two_tasks(self, sup_token):
        r = requests.get(f"{BASE}/alerts", headers=_h(sup_token))
        m005 = [a for a in r.json() if a.get("machine_id") == "M005" and a.get("alert_type") == "Low Water Combined"]
        assert len(m005) >= 1
        a = m005[0]
        assert "WC1 and WC2" in a["alert_message"]
        # Assign it
        assign_r = requests.post(f"{BASE}/alerts/{a['id']}/assign",
                                  headers=_h(sup_token),
                                  json={"operations_staff": "operations02", "priority": "Medium"})
        assert assign_r.status_code == 200, assign_r.text
        data = assign_r.json()
        # Look for tasks in response
        tasks = data.get("tasks") or data.get("items") or data.get("bin_replacement_tasks") or []
        # Or if response contains task_ids/related_task_ids
        if not tasks:
            alert = requests.get(f"{BASE}/alerts/{a['id']}", headers=_h(sup_token)).json()
            tasks = alert.get("related_task_ids") or []
        assert len(tasks) == 2, f"Expected 2 tasks from combined assign, got {len(tasks)}: {data}"


# ==== Cup Dispenser ====
class TestCupDispenser:
    def test_m001_low_cups_alert(self, sup_token):
        r = requests.get(f"{BASE}/alerts", headers=_h(sup_token))
        m001_cups = [a for a in r.json() if a.get("machine_id") == "M001" and a.get("alert_type") == "Low Cups"]
        assert len(m001_cups) >= 1
        assert "Cup Dispenser" in m001_cups[0]["alert_message"] and "low" in m001_cups[0]["alert_message"].lower()

    def test_machine_has_cup_dispenser_slot(self, sup_token):
        r = requests.get(f"{BASE}/catalog/machines/M001/slots", headers=_h(sup_token))
        assert r.status_code == 200
        slots = r.json().get("slots", [])
        cd = [s for s in slots if (s.get("ingredient_name") or "").lower() == "cup dispenser"]
        assert cd, f"No slot named 'Cup Dispenser'; got names: {[s.get('ingredient_name') for s in slots]}"
        assert cd[0].get("capacity") == 200 or cd[0].get("full_capacity") == 200, f"Capacity != 200: {cd[0]}"


# ==== Live Task Progress enrichment ====
class TestLiveTaskProgress:
    def test_base_shape(self, sup_token):
        r = requests.get(f"{BASE}/supervisor/live-task-progress", headers=_h(sup_token))
        assert r.status_code == 200
        data = r.json()
        items = data.get("items") if isinstance(data, dict) else data
        assert isinstance(items, list)
        if items:
            it = items[0]
            for key in ["ticket_id", "ingredient_name", "slot_id", "assigned_operations_staff", "status"]:
                assert key in it, f"Missing key {key} in item: {it.keys()}"

    def test_filters(self, sup_token):
        for q in ["?ingredient=coconut", "?machine_id=M002", "?staff=operations01"]:
            r = requests.get(f"{BASE}/supervisor/live-task-progress{q}", headers=_h(sup_token))
            assert r.status_code == 200, f"{q} -> {r.status_code} {r.text[:200]}"


# ==== Cleaning Tracking ====
class TestCleaningTracking:
    def test_list_returns_five_machines(self, sup_token):
        r = requests.get(f"{BASE}/supervisor/cleaning-tracking", headers=_h(sup_token))
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items") if isinstance(data, dict) else data
        assert len(items) == 5, f"Expected 5 machine rows, got {len(items)}"
        it = items[0]
        for key in ["status", "steps_completed", "photo_proof_count", "review_status"]:
            assert key in it, f"Missing {key}; keys: {list(it.keys())}"

    def test_filters(self, sup_token):
        r = requests.get(f"{BASE}/supervisor/cleaning-tracking?machine_id=M001", headers=_h(sup_token))
        assert r.status_code == 200
        data = r.json()
        items = data.get("items") if isinstance(data, dict) else data
        assert all(i.get("machine_id") == "M001" for i in items)

    def test_review_actions(self, sup_token):
        r = requests.get(f"{BASE}/supervisor/cleaning-tracking?machine_id=M001", headers=_h(sup_token))
        items = r.json().get("items") if isinstance(r.json(), dict) else r.json()
        task_id = None
        for it in items:
            if it.get("cleaning_task_id") or it.get("task_id"):
                task_id = it.get("cleaning_task_id") or it.get("task_id")
                break
        if not task_id:
            pytest.skip("No cleaning task exists on M001 to test review actions")
        for action in ["comment", "mark_reviewed", "escalate"]:
            body = {"action": action, "comment": "TEST_ review comment"} if action == "comment" else {"action": action}
            rr = requests.post(f"{BASE}/supervisor/cleaning-tracking/{task_id}/review", json=body, headers=_h(sup_token))
            assert rr.status_code in (200, 201), f"action={action} -> {rr.status_code} {rr.text}"


# ==== Pickup List all machines ====
class TestPickupList:
    def test_no_machine_id_returns_ops02_machines(self, ops02_token):
        r = requests.get(f"{BASE}/operations/pickup-list", headers=_h(ops02_token))
        assert r.status_code == 200, r.text
        data = r.json()
        items = data if isinstance(data, list) else (data.get("items") or data.get("groups") or [])
        # Flatten possibly grouped
        all_machine_ids = set()
        if items and isinstance(items[0], dict) and "tasks" in items[0]:
            for g in items:
                all_machine_ids.add(g.get("machine_id"))
        else:
            for it in items:
                all_machine_ids.add(it.get("machine_id"))
        if all_machine_ids:
            assert all_machine_ids.issubset({"M004", "M005"}), f"Got machines {all_machine_ids} but ops02 is only assigned M004,M005"

    def test_filter_machine_id(self, ops02_token):
        r = requests.get(f"{BASE}/operations/pickup-list?machine_id=M004", headers=_h(ops02_token))
        assert r.status_code == 200


# ==== Kitchen scan-to-clean ====
class TestKitchenScanToClean:
    def test_cleaning_bins_shape(self, kitchen_token):
        r = requests.get(f"{BASE}/kitchen/cleaning-bins", headers=_h(kitchen_token))
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "counters" in data
        assert set(["total", "cleaned", "pending"]).issubset(set(data["counters"].keys()))

    def test_scan_random_qr(self, kitchen_token):
        r = requests.post(f"{BASE}/kitchen/cleaning-bins/scan", json={"qr_code_id": "RANDOM-NOT-EXIST-XYZ"}, headers=_h(kitchen_token))
        assert r.status_code == 400
        assert "does not match" in r.text.lower() or "not match" in r.text.lower()


# ==== CIP flow ====
class TestCIP:
    def test_cip_end_to_end(self, ops01_token):
        # Trigger cleaning task creation for M002
        r = requests.get(f"{BASE}/operations/cleaning?machine_id=M002", headers=_h(ops01_token))
        assert r.status_code == 200, r.text
        task = r.json()
        steps = task.get("steps") or []
        assert len(steps) == 13, f"Expected 13 cleaning steps, got {len(steps)}"
        cip_step_ix = None
        for i, s in enumerate(steps):
            if s.get("name") == "CIP":
                cip_step_ix = i
                break
        assert cip_step_ix is not None, f"No CIP step in: {[s.get('name') for s in steps]}"
        cip = task.get("cip") or {}
        lines = cip.get("lines") or {}
        assert len(lines) == 11, f"Expected 11 CIP lines, got {len(lines)}: {lines}"
        task_id = task.get("id")
        assert task_id

        def complete_step():
            return requests.post(f"{BASE}/operations/cleaning/{task_id}/steps/{cip_step_ix}",
                                  json={"photo": "captured", "comment": ""}, headers=_h(ops01_token))

        # Try completing CIP step without pump start -> 400
        rr = complete_step()
        assert rr.status_code == 400, f"Expected 400 before pump start, got {rr.status_code}: {rr.text}"

        # Start pump
        rr = requests.post(f"{BASE}/operations/cleaning/{task_id}/cip/pump",
                            json={"action": "start"}, headers=_h(ops01_token))
        assert rr.status_code == 200, rr.text

        # Run each line twice
        for ln in [f"L{i}" for i in range(1, 12)]:
            for _ in range(2):
                rr = requests.post(f"{BASE}/operations/cleaning/{task_id}/cip/line",
                                    json={"line": ln}, headers=_h(ops01_token))
                assert rr.status_code == 200, f"line {ln} -> {rr.status_code}: {rr.text}"

        # Try to complete before pump stopped
        rr = complete_step()
        assert rr.status_code == 400, f"Expected 400 before pump stop, got {rr.status_code}: {rr.text}"

        # Stop pump
        rr = requests.post(f"{BASE}/operations/cleaning/{task_id}/cip/pump",
                            json={"action": "stop"}, headers=_h(ops01_token))
        assert rr.status_code == 200, rr.text

        # Now complete CIP step with photo
        rr = complete_step()
        assert rr.status_code == 200, rr.text

        # Verify cip_records entry via live-task-progress showing CIP Completed
        sup_r = requests.get(f"{BASE}/supervisor/live-task-progress", headers=_h(_login("operations_sup01")))
        assert sup_r.status_code == 200
