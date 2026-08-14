"""
End-to-end backend tests for the Maintenance Technician + Maintenance Supervisor modules.

Covers:
- Auth for all 4 legacy roles (regression smoke) + 3 techs + maintenance supervisor + admin.
- The main E2E scenario (create WO from Pump Failure alert on M001 -> tech01 flow -> supervisor review + close).
- Business rule guards: QR mismatch, QR-not-verified blocks Start Diagnosis/Repair, diagnostic Fail requires comment,
  calibration FAIL is auto-computed and requires comment, PASS/FAIL auto flag, submit-for-review requires component test,
  repair requires before+after photos, critical alert ack without WO/note is blocked, PM step Pass requires photo,
  PM submit is blocked while Not Started, technician flag requires comment.
- Supervisor-side: PM planner, calibration monitoring, workload, spare parts approvals+issue,
  panel access log, escalations, technician workload, service history, spare parts inventory adjust.
"""
import os
import time
import requests
import pytest

def _load_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"

# ---------------------------------------------------------------------------
# Session / auth helpers
# ---------------------------------------------------------------------------
def _login(username: str, password: str = "1234"):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"username": username, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {username} failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module", autouse=True)
def _reset_mock_data():
    """Reset seed data so the E2E scenario has the fresh Pump Failure alert on M001."""
    try:
        admin = _login("admin01")
        admin.post(f"{BASE_URL}/api/admin/mock-data/reset", timeout=120)
    except Exception as e:
        print(f"WARN: could not reset mock data: {e}")
    yield


@pytest.fixture(scope="module")
def sup():
    return _login("maintenance_sup01")


@pytest.fixture(scope="module")
def tech1():
    return _login("tech01")


@pytest.fixture(scope="module")
def tech2():
    return _login("tech02")


# ---------------------------------------------------------------------------
# Legacy role regression smoke
# ---------------------------------------------------------------------------
class TestLegacyRoleRegression:
    def test_kitchen_login_and_pages(self):
        s = _login("kitchen01")
        # Kitchen dashboard-ish endpoints (Preparation Requests, Cleaning Bins, Bin Filling)
        for path in ["/api/kitchen/preparation-requests", "/api/kitchen/cleaning-bins",
                     "/api/kitchen/bin-storage", "/api/kitchen/notifications"]:
            r = s.get(f"{BASE_URL}{path}", timeout=30)
            assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"

    def test_operations_login_and_pages(self):
        s = _login("operations01")
        for path in ["/api/operations/assigned-machines", "/api/operations/pickup-list",
                     "/api/operations/bins?machine_id=M001", "/api/operations/notifications"]:
            r = s.get(f"{BASE_URL}{path}", timeout=30)
            # 200 OK; some endpoints may accept but return list/dict either way
            assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"

    def test_operations_supervisor_login(self):
        s = _login("operations_sup01")
        for path in ["/api/supervisor/dashboard", "/api/alerts",
                     "/api/supervisor/live-task-progress"]:
            r = s.get(f"{BASE_URL}{path}", timeout=30)
            assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"


# ---------------------------------------------------------------------------
# Basic maintenance meta / list endpoints
# ---------------------------------------------------------------------------
class TestMaintenanceMeta:
    def test_supervisor_dashboard(self, sup):
        r = sup.get(f"{BASE_URL}/api/maintenance-sup/dashboard", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["total_machines"] == 5
        for k in ["open_work_orders", "pm_due", "critical_technical_alerts",
                  "pending_supervisor_review", "calibration_failed"]:
            assert k in d

    def test_technician_dashboard(self, tech1):
        r = tech1.get(f"{BASE_URL}/api/maintenance/dashboard", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["assigned_machines"] == 5
        for k in ["open_work_orders", "pm_due", "calibration_due", "critical_alerts",
                  "spare_parts_on_hand", "notifications"]:
            assert k in d

    def test_machines_are_all_five(self, tech1):
        r = tech1.get(f"{BASE_URL}/api/maintenance/machines", timeout=30)
        assert r.status_code == 200
        machines = r.json()
        assert len(machines) == 5
        # machine labels formatted "M001 – Gachibowli"
        for m in machines:
            assert " – " in m.get("machine_label", ""), m

    def test_maintenance_meta(self, tech1):
        r = tech1.get(f"{BASE_URL}/api/maintenance/meta", timeout=30)
        assert r.status_code == 200
        m = r.json()
        assert len(m["diagnostic_checks"]) >= 20
        assert len(m["pm_checklist"]) >= 20
        assert m["tolerance_pct"] == 5

    def test_workload(self, sup):
        r = sup.get(f"{BASE_URL}/api/maintenance-sup/workload", timeout=30)
        assert r.status_code == 200
        wl = r.json()
        techs = {t["technician"] for t in wl}
        assert {"tech01", "tech02", "tech03"}.issubset(techs)


# ---------------------------------------------------------------------------
# MAIN E2E scenario
# ---------------------------------------------------------------------------
class TestMainE2E:
    """Run the entire main E2E scenario sequentially. Order matters."""

    @pytest.fixture(scope="class")
    def ctx(self):
        return {}

    def test_01_find_pump_failure_alert_on_M001(self, sup, ctx):
        r = sup.get(f"{BASE_URL}/api/maintenance-sup/technical-alerts?status=Open&machine_id=M001", timeout=30)
        assert r.status_code == 200
        alerts = r.json()
        pump = [a for a in alerts if a.get("alert_type") == "Pump Failure" and not a.get("work_order_id")]
        assert pump, f"No open Pump Failure alert on M001 without WO. Got: {[(a.get('alert_type'), a.get('status'), a.get('work_order_id')) for a in alerts]}"
        ctx["alert"] = pump[0]

    def test_02_create_wo_from_alert_assign_tech01(self, sup, ctx):
        alert = ctx["alert"]
        r = sup.post(f"{BASE_URL}/api/maintenance-sup/technical-alerts/{alert['id']}/create-work-order",
                     json={"work_type": "Breakdown", "technician": "tech01", "priority": "High",
                           "supervisor_comment": "TEST_e2e main scenario"}, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        wo = j["work_order"]
        assert wo["assigned_technician"] == "tech01"
        assert wo["machine_id"] == "M001"
        assert wo["wo_id"].startswith("WO-")
        ctx["wo_id"] = wo["id"]
        ctx["wo_ref"] = wo["wo_id"]

    def test_03_tech01_receives_notification(self, tech1, ctx):
        r = tech1.get(f"{BASE_URL}/api/maintenance/notifications", timeout=30)
        assert r.status_code == 200
        notifs = r.json()
        matching = [n for n in notifs if ctx["wo_ref"] in (n.get("message") or "")]
        assert matching, f"No notification for {ctx['wo_ref']}"
        assert "New Work Order Assigned" in matching[0]["title"]

    def test_04_tech_accept_travel_reach(self, tech1, ctx):
        for action in ["Accept", "Start Travel", "Reached Machine"]:
            r = tech1.post(f"{BASE_URL}/api/maintenance/work-orders/{ctx['wo_id']}/action",
                           json={"action": action}, timeout=30)
            assert r.status_code == 200, f"{action}: {r.status_code} {r.text}"

    def test_05_start_diagnosis_blocked_before_qr(self, tech1, ctx):
        r = tech1.post(f"{BASE_URL}/api/maintenance/work-orders/{ctx['wo_id']}/action",
                       json={"action": "Start Diagnosis"}, timeout=30)
        assert r.status_code == 400
        assert "QR" in r.text or "qr" in r.text.lower()

    def test_06_wrong_qr_rejected(self, tech1, ctx):
        r = tech1.post(f"{BASE_URL}/api/maintenance/work-orders/{ctx['wo_id']}/verify-qr",
                       json={"qr_code_id": "MQR-M002"}, timeout=30)
        assert r.status_code == 400
        assert "does not match" in r.text

    def test_07_correct_qr_verified(self, tech1, ctx):
        r = tech1.post(f"{BASE_URL}/api/maintenance/work-orders/{ctx['wo_id']}/verify-qr",
                       json={"qr_code_id": "MQR-M001"}, timeout=30)
        assert r.status_code == 200
        assert "verified successfully" in r.text

    def test_08_diagnostics_fail_requires_comment(self, tech1, ctx):
        r = tech1.post(f"{BASE_URL}/api/maintenance/diagnostics", json={
            "machine_id": "M001", "work_order_id": ctx["wo_id"],
            "items": [{"component": "Pumps", "status": "Fail"}]}, timeout=30)
        assert r.status_code == 400
        assert "Comment is mandatory" in r.text

    def test_09_diagnostics_saved_with_comment(self, tech1, ctx):
        r = tech1.post(f"{BASE_URL}/api/maintenance/diagnostics", json={
            "machine_id": "M001", "work_order_id": ctx["wo_id"],
            "items": [
                {"component": "Pumps", "status": "Fail", "comment": "TEST_pump A failed to prime"},
                {"component": "Sensors", "status": "Pass"},
            ],
        }, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["overall_result"] == "Fail"
        # WO now Diagnosis Completed
        r2 = tech1.get(f"{BASE_URL}/api/maintenance/work-orders/{ctx['wo_id']}", timeout=30)
        assert r2.status_code == 200
        assert r2.json()["work_order"]["status"] == "Diagnosis Completed"

    def test_10_start_repair_then_request_part(self, tech1, ctx):
        r = tech1.post(f"{BASE_URL}/api/maintenance/work-orders/{ctx['wo_id']}/action",
                       json={"action": "Start Repair"}, timeout=30)
        assert r.status_code == 200
        # request a spare part
        r2 = tech1.post(f"{BASE_URL}/api/maintenance/spare-parts-requests", json={
            "part_code": "SP-PUMP-001", "part_name": "Peristaltic Pump", "quantity": 1,
            "work_order_id": ctx["wo_id"], "machine_id": "M001", "reason": "Failed diagnostic",
            "priority": "High", "comment": "TEST_e2e",
        }, timeout=30)
        assert r2.status_code == 200, r2.text
        req = r2.json()
        assert req["status"] == "Requested"
        assert req["req_id"].startswith("SPR-")
        ctx["req_id"] = req["id"]
        # WO now Waiting for Parts
        r3 = tech1.get(f"{BASE_URL}/api/maintenance/work-orders/{ctx['wo_id']}", timeout=30)
        assert r3.json()["work_order"]["status"] == "Waiting for Parts"

    def test_11_supervisor_sees_request_approve_then_issue(self, sup, ctx):
        r = sup.get(f"{BASE_URL}/api/maintenance-sup/spare-parts-requests?status=Pending", timeout=30)
        assert r.status_code == 200
        pending = r.json()
        assert any(x["id"] == ctx["req_id"] for x in pending), "SPR not visible to supervisor"

        r2 = sup.post(f"{BASE_URL}/api/maintenance-sup/spare-parts-requests/{ctx['req_id']}/decision",
                      json={"decision": "approve", "comment": "TEST_approved"}, timeout=30)
        assert r2.status_code == 200, r2.text
        r3 = sup.post(f"{BASE_URL}/api/maintenance-sup/spare-parts-requests/{ctx['req_id']}/decision",
                      json={"decision": "issue", "comment": "TEST_issued"}, timeout=30)
        assert r3.status_code == 200, r3.text

    def test_12_tech_receives_part_and_wo_back_to_repair(self, tech1, ctx):
        r = tech1.post(f"{BASE_URL}/api/maintenance/spare-parts-requests/{ctx['req_id']}/receive", timeout=30)
        assert r.status_code == 200, r.text
        # WO returns to Repair In Progress
        r2 = tech1.get(f"{BASE_URL}/api/maintenance/work-orders/{ctx['wo_id']}", timeout=30)
        assert r2.json()["work_order"]["status"] == "Repair In Progress"
        # Part added to technician inventory
        r3 = tech1.get(f"{BASE_URL}/api/maintenance/my-parts", timeout=30)
        parts = {p["part_code"]: p for p in r3.json()}
        assert "SP-PUMP-001" in parts and parts["SP-PUMP-001"]["available_qty"] >= 1
        ctx["available_before"] = parts["SP-PUMP-001"]["available_qty"]

    def test_13_parts_replacement_decrements_inventory(self, tech1, ctx):
        r = tech1.post(f"{BASE_URL}/api/maintenance/parts-replacement", json={
            "work_order_id": ctx["wo_id"], "component": "Pumps", "part_code": "SP-PUMP-001",
            "part_name": "Peristaltic Pump", "quantity": 1, "reason": "Failed Pump",
            "comment": "TEST_replacement",
        }, timeout=30)
        assert r.status_code == 200, r.text
        r2 = tech1.get(f"{BASE_URL}/api/maintenance/my-parts", timeout=30)
        parts = {p["part_code"]: p for p in r2.json()}
        assert parts["SP-PUMP-001"]["available_qty"] == ctx["available_before"] - 1
        # Usage record visible
        r3 = tech1.get(f"{BASE_URL}/api/maintenance/parts-usage", timeout=30)
        assert r3.status_code == 200
        assert any(u["work_order_id"] == ctx["wo_id"] for u in r3.json())

    def test_14_repair_requires_photos(self, tech1, ctx):
        r = tech1.post(f"{BASE_URL}/api/maintenance/repairs", json={
            "work_order_id": ctx["wo_id"], "failed_component": "Pumps",
            "diagnosis_summary": "Pump seized", "root_cause": "Bearing wear",
            "repair_action": "Replaced peristaltic pump",
        }, timeout=30)
        assert r.status_code == 400
        assert "photo" in r.text.lower()

    def test_15_repair_saved_with_photos(self, tech1, ctx):
        r = tech1.post(f"{BASE_URL}/api/maintenance/repairs", json={
            "work_order_id": ctx["wo_id"], "failed_component": "Pumps",
            "diagnosis_summary": "Pump seized", "root_cause": "Bearing wear",
            "repair_action": "Replaced peristaltic pump",
            "before_photo": "mock://before.jpg", "after_photo": "mock://after.jpg",
            "testing_result": "OK",
        }, timeout=30)
        assert r.status_code == 200, r.text

    def test_16_component_test_output(self, tech1, ctx):
        r = tech1.post(f"{BASE_URL}/api/maintenance/component-tests", json={
            "machine_id": "M001", "work_order_id": ctx["wo_id"],
            "component": "Pumps", "command": "Run 5s", "result": "COMPLETED",
        }, timeout=30)
        assert r.status_code == 200, r.text

    def test_17_calibration_pass_and_fail(self, tech1, ctx):
        # PASS auto-calculated
        r = tech1.post(f"{BASE_URL}/api/maintenance/calibrations", json={
            "machine_id": "M001", "slot_id": "L1", "bin_id": "BIN-LIQUID-01", "item": "Water",
            "calibration_type": "Volume", "expected_quantity": 150, "actual_quantity": 152,
            "unit": "ml", "work_order_id": ctx["wo_id"],
        }, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["result"] == "PASS"

        # FAIL requires comment
        r2 = tech1.post(f"{BASE_URL}/api/maintenance/calibrations", json={
            "machine_id": "M001", "slot_id": "L1", "bin_id": "BIN-LIQUID-01", "item": "Water",
            "calibration_type": "Volume", "expected_quantity": 100, "actual_quantity": 80, "unit": "ml",
            "work_order_id": ctx["wo_id"],
        }, timeout=30)
        assert r2.status_code == 400
        assert "FAIL" in r2.text

        # FAIL with comment succeeds
        r3 = tech1.post(f"{BASE_URL}/api/maintenance/calibrations", json={
            "machine_id": "M001", "slot_id": "L1", "bin_id": "BIN-LIQUID-01", "item": "Water",
            "calibration_type": "Volume", "expected_quantity": 100, "actual_quantity": 80, "unit": "ml",
            "work_order_id": ctx["wo_id"], "comment": "TEST_out-of-tolerance",
        }, timeout=30)
        assert r3.status_code == 200, r3.text
        assert r3.json()["result"] == "FAIL"

    def test_18_start_testing_and_submit_for_review(self, tech1, ctx):
        r = tech1.post(f"{BASE_URL}/api/maintenance/work-orders/{ctx['wo_id']}/action",
                       json={"action": "Start Testing"}, timeout=30)
        assert r.status_code == 200, r.text
        r2 = tech1.post(f"{BASE_URL}/api/maintenance/work-orders/{ctx['wo_id']}/action",
                        json={"action": "Submit for Supervisor Review"}, timeout=30)
        assert r2.status_code == 200, r2.text
        r3 = tech1.get(f"{BASE_URL}/api/maintenance/work-orders/{ctx['wo_id']}", timeout=30)
        assert r3.json()["work_order"]["status"] == "Pending Supervisor Review"

    def test_19_supervisor_review_approve_close(self, sup, ctx):
        r = sup.post(f"{BASE_URL}/api/maintenance-sup/work-orders/{ctx['wo_id']}/review",
                     json={"decision": "approve", "comment": "TEST_reviewed OK"}, timeout=30)
        assert r.status_code == 200, r.text
        r2 = sup.get(f"{BASE_URL}/api/maintenance-sup/technical-alerts?status=Resolved", timeout=30)
        assert r2.status_code == 200
        # Fetch WO detail via list
        r3 = sup.get(f"{BASE_URL}/api/maintenance/work-orders?machine_id=M001", timeout=30)
        assert r3.status_code == 200
        target = next((w for w in r3.json() if w["id"] == ctx["wo_id"]), None)
        assert target and target["status"] == "Closed"
        # History includes Supervisor Reviewed + Closed
        stages = [h["stage"] for h in target.get("history", [])]
        assert "Supervisor Reviewed" in stages and "Closed" in stages

    def test_20_service_history_written(self, sup, ctx):
        r = sup.get(f"{BASE_URL}/api/maintenance/service-history?technician=tech01", timeout=30)
        assert r.status_code == 200
        assert any(h.get("work_order_ref") == ctx["wo_ref"] for h in r.json())


# ---------------------------------------------------------------------------
# Additional guard/coverage tests
# ---------------------------------------------------------------------------
class TestGuardsAndCoverage:
    def test_submit_review_blocked_without_component_test(self, sup, tech2):
        # Create a fresh WO for tech02 directly via supervisor endpoint, verify QR, then attempt to submit without any test
        r = sup.post(f"{BASE_URL}/api/maintenance-sup/work-orders", json={
            "machine_id": "M002", "work_type": "Breakdown", "issue_type": "Pump Failure",
            "component": "Pumps", "priority": "Medium", "technician": "tech02",
            "supervisor_comment": "TEST_guard",
        }, timeout=30)
        assert r.status_code == 200, r.text
        wo = r.json()["work_order"]
        wo_id = wo["id"]
        # Accept -> travel -> reach -> QR verify (correct)
        for a in ["Accept", "Start Travel", "Reached Machine"]:
            tech2.post(f"{BASE_URL}/api/maintenance/work-orders/{wo_id}/action", json={"action": a}, timeout=30)
        vr = tech2.post(f"{BASE_URL}/api/maintenance/work-orders/{wo_id}/verify-qr",
                        json={"qr_code_id": "MQR-M002"}, timeout=30)
        assert vr.status_code == 200
        # Diagnostics pass
        tech2.post(f"{BASE_URL}/api/maintenance/diagnostics", json={
            "machine_id": "M002", "work_order_id": wo_id,
            "items": [{"component": "Sensors", "status": "Pass"}],
        }, timeout=30)
        # Start Repair -> Start Testing (skip repair details/component tests)
        tech2.post(f"{BASE_URL}/api/maintenance/work-orders/{wo_id}/action", json={"action": "Start Repair"}, timeout=30)
        tech2.post(f"{BASE_URL}/api/maintenance/work-orders/{wo_id}/action", json={"action": "Start Testing"}, timeout=30)
        # Now attempt to submit without component testing
        r2 = tech2.post(f"{BASE_URL}/api/maintenance/work-orders/{wo_id}/action",
                        json={"action": "Submit for Supervisor Review"}, timeout=30)
        assert r2.status_code == 400
        assert "component testing" in r2.text.lower()

    def test_critical_alert_ack_blocked_without_wo_or_note(self, sup):
        # Find a critical alert with no WO
        r = sup.get(f"{BASE_URL}/api/maintenance-sup/technical-alerts?status=Open&severity=Critical", timeout=30)
        assert r.status_code == 200
        candidates = [a for a in r.json() if not a.get("work_order_id")]
        if not candidates:
            pytest.skip("No open critical alert without WO available")
        alert = candidates[0]
        r2 = sup.post(f"{BASE_URL}/api/maintenance-sup/technical-alerts/{alert['id']}/acknowledge",
                      json={"resolution_note": ""}, timeout=30)
        assert r2.status_code == 400
        assert "resolution" in r2.text.lower() or "work order" in r2.text.lower()

    def test_flag_requires_comment_and_creates_escalation(self, sup, tech2):
        # Use seeded WO-0002 (tech02) which is already flagged/in-progress; use assignment target
        r = tech2.get(f"{BASE_URL}/api/maintenance/work-orders?active=true", timeout=30)
        assert r.status_code == 200
        active = [w for w in r.json() if w["assigned_technician"] == "tech02"]
        if not active:
            pytest.skip("No active WO for tech02")
        wo_id = active[0]["id"]
        # Empty comment
        r2 = tech2.post(f"{BASE_URL}/api/maintenance/work-orders/{wo_id}/flag",
                        json={"reason": "Additional Failure Found", "comment": " "}, timeout=30)
        assert r2.status_code == 400
        # With comment -> escalation created
        r3 = tech2.post(f"{BASE_URL}/api/maintenance/work-orders/{wo_id}/flag",
                        json={"reason": "Additional Failure Found", "comment": "TEST_flag"}, timeout=30)
        assert r3.status_code == 200, r3.text
        esc_id = r3.json().get("escalation_id")
        assert esc_id and esc_id.startswith("ESC-")
        # Supervisor sees it
        r4 = sup.get(f"{BASE_URL}/api/maintenance-sup/escalations", timeout=30)
        assert r4.status_code == 200
        assert any(e.get("esc_id") == esc_id for e in r4.json())

    def test_pm_planner_creates_pm_and_wo(self, sup, tech1):
        r = sup.post(f"{BASE_URL}/api/maintenance-sup/pm", json={
            "machine_id": "M003", "pm_type": "Routine PM", "frequency": "Quarterly",
            "priority": "Medium", "comment": "TEST_pm",
        }, timeout=30)
        assert r.status_code == 200, r.text
        pm = r.json()["pm"]
        assert pm["pm_id"].startswith("PM-")
        assert pm["work_order_ref"].startswith("WO-")
        assert pm["technician"] in ("tech01", "tech02", "tech03")

        # PM Step Pass requires photo when step requires it
        # First start the PM
        pm_id = pm["id"]
        # login as the assigned tech
        tech_sess = _login(pm["technician"])
        rs = tech_sess.post(f"{BASE_URL}/api/maintenance/pm-tasks/{pm_id}/start", timeout=30)
        assert rs.status_code == 200, rs.text
        # find a step that requires photo
        step = next((s for s in rs.json()["steps"] if s["requires_photo"]), None)
        assert step, "No step requires photo"
        # Pass without photo -> 400
        r2 = tech_sess.post(f"{BASE_URL}/api/maintenance/pm-tasks/{pm_id}/step", json={
            "step": step["step"], "status": "Pass",
        }, timeout=30)
        assert r2.status_code == 400
        assert "photo" in r2.text.lower()
        # Pass with photo -> 200
        r3 = tech_sess.post(f"{BASE_URL}/api/maintenance/pm-tasks/{pm_id}/step", json={
            "step": step["step"], "status": "Pass", "after_photo": "mock://after.jpg",
        }, timeout=30)
        assert r3.status_code == 200, r3.text
        # Submit blocked while other steps Not Started
        r4 = tech_sess.post(f"{BASE_URL}/api/maintenance/pm-tasks/{pm_id}/submit", timeout=30)
        assert r4.status_code == 400
        assert "Not Started" in r4.text

    def test_panel_access_logs(self, tech1):
        # Open + close each panel and confirm log entries
        for panel in ["Right Door", "Left Door", "Back Door", "Service Panel"]:
            for cmd in ["Open", "Close"]:
                r = tech1.post(f"{BASE_URL}/api/maintenance/panel-access", json={
                    "machine_id": "M001", "panel": panel, "command": cmd,
                }, timeout=30)
                assert r.status_code == 200, f"{panel} {cmd}: {r.status_code} {r.text}"
        r = tech1.get(f"{BASE_URL}/api/maintenance/panel-access?machine_id=M001", timeout=30)
        assert r.status_code == 200
        logs = r.json()["logs"]
        panels_seen = {l["panel"] for l in logs}
        assert {"Right Door", "Left Door", "Back Door", "Service Panel"}.issubset(panels_seen)

    def test_calibration_monitoring_and_recalibration(self, sup):
        r = sup.get(f"{BASE_URL}/api/maintenance-sup/calibration-monitoring", timeout=30)
        assert r.status_code == 200
        cals = r.json()
        # standardized bin ids present when set
        for c in cals:
            if c.get("bin_id"):
                assert c["bin_id"].startswith("BIN-"), c["bin_id"]

    def test_spare_parts_inventory_adjust(self, sup):
        r = sup.get(f"{BASE_URL}/api/maintenance-sup/spare-parts-inventory", timeout=30)
        assert r.status_code == 200
        parts = r.json()
        assert parts, "No spare parts seeded"
        part_id = parts[0]["id"]
        before = parts[0]["total_stock"]
        r2 = sup.post(f"{BASE_URL}/api/maintenance-sup/spare-parts-inventory/{part_id}/adjust",
                      json={"delta": 5, "comment": "TEST_adjust +5"}, timeout=30)
        assert r2.status_code == 200
        r3 = sup.get(f"{BASE_URL}/api/maintenance-sup/spare-parts-inventory", timeout=30)
        after = next(p for p in r3.json() if p["id"] == part_id)["total_stock"]
        assert after == before + 5
        # reverse
        sup.post(f"{BASE_URL}/api/maintenance-sup/spare-parts-inventory/{part_id}/adjust",
                 json={"delta": -5}, timeout=30)

    def test_calibration_targets_use_standardized_bins(self, tech1):
        r = tech1.get(f"{BASE_URL}/api/maintenance/calibration-targets?machine_id=M001", timeout=30)
        assert r.status_code == 200
        targets = r.json()
        assert targets
        # Slot codes L1..P10..S10..ICE style, bin IDs BIN-*
        for t in targets:
            if t.get("bin_id"):
                assert t["bin_id"].startswith("BIN-"), t
