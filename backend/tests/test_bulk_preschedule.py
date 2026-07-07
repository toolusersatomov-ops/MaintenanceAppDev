"""Backend tests for Pre-Schedule Bulk Replacements feature and regression
tests for the shared create_replacement_pipeline() helper used by single-alert
assign flows (workflow.py). Covers: catalog machine/slot listing, bulk order
placement with mixed kitchen_required flags, auto-fulfillment from spare bin
logic, and grouping visibility on Kitchen Preparation Requests + Operations
Pickup List by bulk_order_id. Also regression-tests the alert assign flow.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": "admin01", "password": "1234"})
    assert r.status_code == 200
    return s


@pytest.fixture(scope="module", autouse=True)
def reset_mock_data(admin_client):
    r = admin_client.post(f"{BASE_URL}/api/admin/mock-data/reset")
    assert r.status_code == 200
    yield


@pytest.fixture(scope="module")
def sup_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": "operations_sup01", "password": "1234"})
    assert r.status_code == 200
    return s


@pytest.fixture(scope="module")
def kitchen_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": "kitchen01", "password": "1234"})
    assert r.status_code == 200
    return s


@pytest.fixture(scope="module")
def ops_client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": "operations01", "password": "1234"})
    assert r.status_code == 200
    return s


class TestCatalog:
    def test_list_machines(self, sup_client):
        r = sup_client.get(f"{BASE_URL}/api/catalog/machines")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        self.machine_id = data[0]["id"]

    def test_machine_slots_grouped(self, sup_client):
        r = sup_client.get(f"{BASE_URL}/api/catalog/machines")
        mid = r.json()[0]["id"]
        r2 = sup_client.get(f"{BASE_URL}/api/catalog/machines/{mid}/slots")
        assert r2.status_code == 200
        data = r2.json()
        assert "grouped" in data
        for cat in ["Liquid", "Powder", "Solid", "Other"]:
            assert cat in data["grouped"]

    def test_ingredients_have_refill_qty(self, sup_client):
        r = sup_client.get(f"{BASE_URL}/api/catalog/ingredients")
        assert r.status_code == 200
        data = r.json()
        assert len(data) > 0
        assert "refill_quantity_120_cups" in data[0]


class TestBulkOrder:
    """Places a bulk order for M001 with 1 kitchen_required=False (Liquid, spare
    bin should exist) item and 1 kitchen_required=True item, then verifies
    grouping on kitchen + operations pickup list pages."""

    @pytest.fixture(scope="class")
    def bulk_setup(self, sup_client):
        machine_id = "M001"
        slots = sup_client.get(f"{BASE_URL}/api/catalog/machines/{machine_id}/slots").json()
        liquid_slots = slots["grouped"]["Liquid"]
        powder_slots = slots["grouped"]["Powder"]
        assert len(liquid_slots) >= 1
        assert len(powder_slots) >= 1
        liquid_slot = liquid_slots[0]
        powder_slot = powder_slots[0]

        payload = {
            "machine_id": machine_id,
            "operations_staff": "operations01",
            "items": [
                {
                    "slot_id": liquid_slot["id"], "ingredient_code": liquid_slot["ingredient_code"],
                    "priority": "High", "kitchen_required": False, "comment": "TEST auto-fulfill item",
                    "operations_staff": None,
                },
                {
                    "slot_id": powder_slot["id"], "ingredient_code": powder_slot["ingredient_code"],
                    "priority": "Medium", "kitchen_required": True, "comment": "TEST kitchen item",
                    "operations_staff": None,
                },
            ],
        }
        r = sup_client.post(f"{BASE_URL}/api/alerts/pre-schedule/bulk", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        return {"machine_id": machine_id, "response": data, "liquid_slot": liquid_slot, "powder_slot": powder_slot}

    def test_bulk_order_response_structure(self, bulk_setup):
        data = bulk_setup["response"]
        assert "order_id" in data
        assert len(data["items"]) == 2
        for item in data["items"]:
            assert "bin_replacement_task_id" in item
            assert "pickup_task_id" in item
            assert "kitchen_required" in item  # actual result flag

    def test_liquid_item_auto_fulfill_or_fallback(self, bulk_setup, ops_client):
        """Item 1 requested kitchen_required=False. Verify either auto-fulfilled
        (kitchen_prep_request_id None, pickup status Ready for Pickup with bin_id)
        or gracefully fell back to kitchen flow if no spare bin was available."""
        item = bulk_setup["response"]["items"][0]
        order_id = bulk_setup["response"]["order_id"]
        pickup = ops_client.get(f"{BASE_URL}/api/operations/pickup-list?machine_id={bulk_setup['machine_id']}").json()
        pt = next((p for p in pickup if p["id"] == item["pickup_task_id"]), None)
        assert pt is not None
        assert pt["bulk_order_id"] == order_id
        if item["kitchen_required"] is False:
            assert pt["status"] == "Ready for Pickup"
            assert pt["bin_id"] is not None
            assert item["kitchen_prep_request_id"] is None
        else:
            # graceful fallback - no spare bin was available
            assert pt["status"] == "Pending Prep"
            assert item["kitchen_prep_request_id"] is not None

    def test_powder_item_requires_kitchen(self, bulk_setup):
        item = bulk_setup["response"]["items"][1]
        assert item["kitchen_required"] is True
        assert item["kitchen_prep_request_id"] is not None

    def test_kitchen_prep_requests_grouped_by_bulk_order(self, bulk_setup, kitchen_client):
        order_id = bulk_setup["response"]["order_id"]
        r = kitchen_client.get(f"{BASE_URL}/api/kitchen/preparation-requests")
        assert r.status_code == 200
        items = r.json()
        bulk_items = [i for i in items if i.get("bulk_order_id") == order_id]
        # Only items that actually required kitchen (kitchen_prep_request_id not None) should appear
        expected_count = sum(1 for i in bulk_setup["response"]["items"] if i["kitchen_required"] is True)
        assert len(bulk_items) == expected_count

    def test_pickup_list_grouped_by_bulk_order_all_items(self, bulk_setup, ops_client):
        order_id = bulk_setup["response"]["order_id"]
        r = ops_client.get(f"{BASE_URL}/api/operations/pickup-list?machine_id={bulk_setup['machine_id']}")
        assert r.status_code == 200
        items = r.json()
        bulk_items = [i for i in items if i.get("bulk_order_id") == order_id]
        # ALL items from bulk order should show here regardless of kitchen_required
        assert len(bulk_items) == 2

    def test_bulk_order_list_endpoint(self, bulk_setup, sup_client):
        order_id = bulk_setup["response"]["order_id"]
        r = sup_client.get(f"{BASE_URL}/api/alerts/pre-schedule/bulk/list")
        assert r.status_code == 200
        orders = r.json()
        found = next((o for o in orders if o["id"] == order_id), None)
        assert found is not None
        assert found["machine_id"] == bulk_setup["machine_id"]
        assert len(found["items"]) == 2

    def test_empty_cart_rejected(self, sup_client):
        r = sup_client.post(f"{BASE_URL}/api/alerts/pre-schedule/bulk", json={
            "machine_id": "M001", "operations_staff": "operations01", "items": [],
        })
        assert r.status_code == 400


class TestRegressionAlertAssign:
    """Regression: single-alert assign flow must still behave identically after
    workflow.py's create_replacement_pipeline signature change (kitchen_required
    defaults True, no bulk_order_id)."""

    def test_ensure_and_assign_alert(self, sup_client):
        machine_id = "M002"
        slots = sup_client.get(f"{BASE_URL}/api/catalog/machines/{machine_id}/slots").json()
        slot = slots["slots"][0]
        r = sup_client.post(f"{BASE_URL}/api/alerts/ensure", json={"machine_id": machine_id, "slot_id": slot["id"]})
        assert r.status_code == 200
        alert_id = r.json()["id"]

        r2 = sup_client.post(f"{BASE_URL}/api/alerts/{alert_id}/assign", json={
            "operations_staff": "operations01", "create_kitchen_ticket": True,
        })
        assert r2.status_code == 200
        data = r2.json()
        assert data["kitchen_required"] is True
        assert data["kitchen_prep_request_id"] is not None

        detail = sup_client.get(f"{BASE_URL}/api/alerts/{alert_id}/detail")
        assert detail.status_code == 200
        assert detail.json()["status"] == "Assigned"
