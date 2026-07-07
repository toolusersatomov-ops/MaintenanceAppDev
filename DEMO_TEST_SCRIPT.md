# tare — Demo & Test Script

App URL: https://hulk-maintenance-app.preview.emergentagent.com
All passwords: `1234` — or simply click the **quick-login chips** on the Login page.

| User | Role | Name | Scope |
|---|---|---|---|
| operations_sup01 | Operations Supervisor | Priya Sharma | All machines |
| kitchen01 | Kitchen Staff | Rakesh Kumar | Kitchen |
| operations01 | Operations Staff | Anil Verma | M001–M003 |
| operations02 | Operations Staff | Suresh Reddy | M004–M005 |
| tech01 | Maintenance Technician | Vikram Singh | Work orders |
| maintenance_sup01 | Maintenance Supervisor | Ravi Patel | Maintenance |
| admin01 | Admin | System Admin | Demo Reset |

> Tip: Before a live demo, log in as **admin01** and click **Reset Demo Data** on the Admin Dashboard. This restores every scenario below to its starting state.

---

## Scenario 0 — Login Security (2 min)
1. On the Login page, type user `kitchen01` with a WRONG password 5 times.
   - ✅ Each attempt shows an invalid-credentials error; after the limit the account shows the **locked** message.
2. Log in as `operations_sup01` → **User & Access Management** → unlock `kitchen01`.
   - ✅ kitchen01 can log in again with `1234`.
3. Show the quick-login chips: click any chip → fields auto-fill → Sign In.

## Scenario 1 — Alert to Replacement, End-to-End (8 min)
*The heart of the app: a low-stock alert travels Supervisor → Kitchen → Operations → back to Kitchen.*

**A. Supervisor (operations_sup01)**
1. **Dashboard** — point out machine health cards, sales KPIs, pending counts.
2. **Alerts** — open a "Low Stock" alert (e.g., M002 Almond Milk). Show alert detail: current level, affected recipes, suggested action.
3. Assign an Operations Staff (operations01) → this auto-creates a **Kitchen Fill Ticket** + **Pickup Task**.
4. **Live Task Progress** — show the new timeline: "Alert Reviewed → Staff Assigned → Kitchen Fill Ticket Created".

**B. Kitchen (kitchen01)**
5. **Preparation Requests** — the new ticket is in *Pending*. Click **Start Preparation**.
6. **Bin Filling** — scan the bin QR (simulated scanner accepts the QR id shown), enter quantity (auto-calculated, read-only), expiry auto-set, **Save Bin**.
   - ✅ Status becomes "Saved / Ready for Pickup"; pickup task unblocks.

**C. Operations Staff (operations01)**
7. **Pickup List** — select the machine, the saved bin shows **Ready for Pickup**. Scan its QR → status **Picked**. Then "Mark All Scheduled Items Picked" → loaded on trolley.
8. **Bin Replacement Tasks** — open the task and walk the guided steps:
   scan slot QR → remove old bin → place new bin → **scan old bin** (lenient: typing `AUTO` is accepted) → **Complete**.
   - ✅ Machine slot refills to 100%; alert closes.
9. **Dirty Bin Return** — the old bin is listed; scan it → **Returned to Kitchen**.

**D. Kitchen closes the loop (kitchen01)**
10. **Cleaning Bins** — advance the returned bin: Washing Pending → Washed → Drying → Dried → **Clean / Ready for Filling**.
    - ✅ Bin returns to the spare pool, ready for the next fill.

**E. Supervisor wrap-up**
11. **Live Task Progress** — full timeline with every stage, timestamp and actor.
12. **Reports** — completed replacement appears in the Bin Replacement report.

## Scenario 2 — Bulk Pre-Schedule Replacements (5 min)
*Supervisor schedules many bins at once; kitchen-not-required items auto-fulfil from spare bins.*

1. **Supervisor** → **Pre-Schedule Bulk Replacements**. Select machine **M005**.
2. Click several slot cards to build the **Reschedule Cart** (or use "Select All Low Stock Items"). Toggle *Kitchen Required* off for one Solid item.
3. Pick Operations Staff (operations02) → **Place Bulk Order**.
   - ✅ One bulk order id; kitchen-required items create fill tickets; the non-kitchen item is auto-fulfilled from a spare clean bin and is instantly **Ready for Pickup**.
4. **Kitchen** → Preparation Requests: items grouped under a **Bulk Order** banner.
5. **Operations (operations02)** → Pickup List: same bulk grouping; the auto-fulfilled item is already pickable.
6. *(Pre-seeded example: an M004 bulk order with Pomegranate Juice + Vanilla Protein Powder pending and Banana ready is already visible.)*

## Scenario 3 — Machine Cleaning & Sanitization (3 min)
1. **Operations (operations01)** → **Cleaning & Sanitization** → machine **M001**.
   - ✅ Today's checklist is already 3/11 done (photos attached) — continue it.
2. For each remaining step: **upload a photo (mock)**, add a comment, mark complete. Photo is mandatory — try completing without one to show validation.
3. Complete all steps → task flips to **Completed**, machine's last-cleaning date updates, supervisor gets a notification.

## Scenario 4 — Kitchen Change Request (2 min)
1. **Kitchen** → **Change Requests** — show the open demo request ("quantity overfilled… human error").
2. Raise a new one from a preparation request.
3. **Supervisor** → notification received → review under Kitchen Preparation Status → kitchen resolves it.

## Scenario 5 — Door Control & Machine Ops (2 min)
1. **Operations** → **Door Control** → choose machine and door → Open Door / Close Door / Confirm Closed.
   - ✅ Every action is audit-logged with actor + time.
2. **Assigned Machines** — trolley status, last visit, cleaning status at a glance.

## Scenario 6 — Maintenance Workflow (4 min)
1. **Maintenance Supervisor (maintenance_sup01)** → **Technical Alerts**: 3 seeded alerts (motor overheating, door sensor, nozzle flow).
2. **Work Orders** → assign the unassigned Door Sensor order to `tech01`.
3. **Technician (tech01)** → **Assigned Work Orders** → accept → walk the repair stages; raise a **Spare Parts Request**.
4. **Maintenance Supervisor** → **Spare Parts Approvals** → approve. Show **Machine Health Center**, **PM Planner** (overdue PM on 2 machines) and the open **Escalation**.

## Scenario 7 — Supervisor Analytics & Admin (3 min)
1. **Supervisor** → **Reports**: sales by machine/drink (M002 is top seller), replacements, cleaning history, activity log.
2. **Machine Control Center** — slot-level live view of all 5 machines: fill %, expiry, replacement due.
3. **Admin (admin01)** → **Admin Dashboard** → data status counts → **Reset Demo Data** to restore everything for the next demo.

---

## Quick Regression Checklist (for testers)
- [ ] Login works for all 7 users; lockout after 5 wrong attempts; supervisor unlock works.
- [ ] Alert assignment creates 3 linked records (replacement task, pickup task, kitchen ticket).
- [ ] Kitchen cannot save a bin without scanning the correct QR; quantity is read-only.
- [ ] Pickup scan rejects a wrong QR with the exact spec error message.
- [ ] Replacement flow enforces order: slot scan → old-bin removal → new-bin placement → old-bin scan (accepts literal `AUTO`).
- [ ] Completing replacement refills slot to 100% and closes the alert.
- [ ] Dirty bin travels: Returned from Machine → Returned to Kitchen → …→ Clean / Ready for Filling (returns to spare pool).
- [ ] Bulk order groups items by order id on Kitchen + Operations pages; kitchen-not-required auto-fulfils when a spare bin exists.
- [ ] Cleaning checklist blocks completion without a photo; completion stamps machine record.
- [ ] Email-Kitchen escalation on an alert is only allowed after the alert is 30+ minutes old.
- [ ] Admin Demo Reset restores all seed + demo scenarios (idempotent, safe to run repeatedly).

**Automated backend regression:** `python3 /app/scripts/e2e_test.py` (29 steps, should pass 100%).
