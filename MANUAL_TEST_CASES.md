# tare — Manual End-to-End Test Cases

**App:** https://hulk-maintenance-app.preview.emergentagent.com
**Passwords:** all `1234` (or click quick-login chips)
**Before starting:** login `admin01` → Admin Dashboard → **Reset Demo Data** → logout. This gives a known starting state.

---

## MODULE 1 — LOGIN & SECURITY

**TC-1.1 Quick-chip login**
Steps: Open app → click chip `operations_sup01` → Sign In.
Expected: Fields auto-fill; supervisor dashboard opens; sidebar shows "Priya Sharma – Operations Supervisor".

**TC-1.2 Wrong password error**
Steps: Enter `kitchen01` / `9999` → Sign In.
Expected: Invalid credentials error; no login.

**TC-1.3 Account lockout after 5 attempts**
Steps: Repeat TC-1.2 five times.
Expected: 5th attempt shows account-locked message; correct password also rejected while locked.

**TC-1.4 Supervisor unlock**
Steps: Login `operations_sup01` → User & Access Management → find `kitchen01` → Unlock.
Expected: Status Active; `kitchen01` can log in with `1234`.

**TC-1.5 Role routing**
Steps: Login each of the 7 users once.
Expected: Each lands on their own role dashboard; sidebar menus differ per role; no crashes.

---

## MODULE 2 — ALERTS & CONSUMABLE LOGIC (Supervisor: operations_sup01)

**TC-2.1 Alert inventory after reset**
Steps: Open Alerts.
Expected: Mix of alerts across machines: Low Stock, Near Expiry, Waste Water Monitoring (M004), Waste Water Full (M002), Low Water (M003 WC1), Low Water Combined (M005 WC1+WC2), Low Cups (M001), Low Sanitizer (M003).

**TC-2.2 Waste water awareness alert cannot be assigned**
Steps: Open the M004 "Waste Water Monitoring" alert → try to assign staff.
Expected: Blocked with message that it's an awareness alert; message reads "WWC2 is 90% full. Monitor waste water level."

**TC-2.3 Combined waste water alert creates 2 tasks**
Steps: Open the M002 "Waste Water Full" alert (message "WWC2 and WWC3 are almost full. Change / empty WWC2 and WWC3 together.") → assign `operations01`.
Expected: Success message about combined task covering 2 cans; two tasks appear in operations01's Bin Replacement Tasks (WWC2 + WWC3); no kitchen ticket created.

**TC-2.4 Combined low water alert**
Steps: Open M005 "Low Water Combined" → assign `operations02`.
Expected: 2 tasks created (WC1 + WC2); alert status Assigned.

**TC-2.5 Cup dispenser alert**
Steps: Find M001 "Low Cups" alert.
Expected: Message "Cup Dispenser level is low."; Machine Control Center shows M001 Cup Dispenser at 12% of 200 cups.

**TC-2.6 Low Stock alert detail**
Steps: Open a Low Stock alert (e.g. M002 Almond Milk).
Expected: Detail page shows current qty, level %, capacity, affected recipes, suggested action.

**TC-2.7 Email-Kitchen 30-min gate**
Steps: On a freshly created alert (< 30 min old) click Email Kitchen.
Expected: Blocked until the alert is 30+ minutes old.

---

## MODULE 3 — FULL REPLACEMENT LIFECYCLE (the core flow)

**TC-3.1 Supervisor assigns alert** (operations_sup01)
Steps: Alerts → open M002 Low Stock (Almond Milk) → assign `operations01`.
Expected: Alert → Assigned; Live Task Progress shows new timeline "Alert Reviewed → Staff Assigned → Kitchen Fill Ticket Created".

**TC-3.2 Kitchen ticket fields** (kitchen01)
Steps: Preparation Requests → Pending tab.
Expected: New ticket shows Ticket ID, Ingredient, Qty+Unit, Bin Type, Priority, Due Time. NO machine name/location anywhere on the card.

**TC-3.3 Start prep + scan bin**
Steps: Start Preparation → in fill panel click scan → choose a clean spare Liquid bin QR.
Expected: Bin recognized; quantity read-only auto-calculated; expiry auto-filled.

**TC-3.4 Save bin without confirm checkbox**
Steps: Click Save Bin Details directly (no checkbox exists anymore).
Expected: Saves successfully → "Saved / Ready for Pickup". Note text says cleanliness is validated from the QR scan.

**TC-3.5 Scan a dirty bin (negative)**
Steps: Start another prep → scan a bin that is NOT clean (if offered, pick a dirty one; otherwise skip).
Expected: Error "This bin is not marked clean…".

**TC-3.6 Pickup — all machines grouped** (operations01)
Steps: Pickup List → dropdown default "All Assigned Machines".
Expected: Tasks grouped by machine (M001–M003 only); bulk orders grouped inside machine groups; "Mark All" disabled with hint to select a machine.

**TC-3.7 Pickup QR scan (demo camera)**
Steps: Select M002 → Open Camera / Scan Bin QR.
Expected: Modal shows demo note ("Demo Mode: Select a QR from the list…"); list of Ready-for-Pickup QRs; selecting the saved bin's QR auto-marks it Picked — no confirm checkbox/step. Optional "Last Scan Result" undo panel appears.

**TC-3.8 Wrong QR scan (negative)**
Steps: In the scan modal, if another machine's QR is visible, try it; or verify only valid QRs are listed.
Expected: Mismatched QR rejected with the exact spec error.

**TC-3.9 Mark all picked → trolley**
Steps: With all Ready items scanned → "Mark All Scheduled Items Picked".
Expected: Trolley Loaded; stage advances.

**TC-3.10 Guided replacement steps**
Steps: Bin Replacement Tasks → open the Almond Milk task → follow steps: scan slot QR → remove old bin → place new bin (scan its QR) → scan old bin (type `AUTO` — must be accepted) → Complete.
Expected: Steps enforce order (out-of-order attempts show errors); slot refills to 100% in Machine Bin Status; alert auto-closes; supervisor notified.

**TC-3.11 Dirty bin return**
Steps: Dirty Bin Return → select M002 → scan the old bin QR.
Expected: Status "Returned to Kitchen"; kitchen notified.

**TC-3.12 Kitchen scan-to-clean** (kitchen01)
Steps: Cleaning Bins (note: menu sits ABOVE Bin Filling) → counters visible (Total/Cleaned/Pending) → Open Camera / Scan Dirty Bin QR → select the returned bin's QR.
Expected: "Bin scanned and marked clean." Green tick; counters update ("Cleaned X of Y bins"); bin returns to spare pool (Bin Storage).

**TC-3.13 Re-scan cleaned bin (negative)**
Steps: Scan the same QR again.
Expected: "This bin is already marked clean."

**TC-3.14 One-click Mark as Cleaned**
Steps: For another dirty bin use the "Mark as Cleaned" button instead of scanning.
Expected: Same result as scan; cleaning guide (numbered steps) visible above list.

**TC-3.15 End-to-end timeline** (operations_sup01)
Steps: Live Task Progress → find the completed task.
Expected: Full timeline with every stage, timestamp and actor; card shows Ticket TKT-xxxx, ingredient, slot, assigned staff.

---

## MODULE 4 — BULK PRE-SCHEDULE (operations_sup01)

**TC-4.1 Build a bulk order**
Steps: Pre-Schedule Bulk Replacements → select M005 → click 3 slot cards (mix Liquid/Powder/Solid) → toggle Kitchen Required OFF for the Solid one → staff `operations02` → Place Bulk Order.
Expected: One bulk order id; kitchen-required items produce fill tickets; the non-kitchen item auto-fulfils from a spare clean bin (if available) and shows Ready for Pickup immediately.

**TC-4.2 Kitchen grouping** (kitchen01)
Steps: Preparation Requests.
Expected: Bulk items grouped under a "Bulk Order · n item(s)" banner; cards still show Ticket/Qty/Bin Type/Priority/Due, no machine.

**TC-4.3 Operations grouping** (operations02)
Steps: Pickup List → All Assigned Machines.
Expected: M005 group shows the bulk banner; auto-fulfilled item pickable now; others "Pending Prep".

**TC-4.4 Complete one bulk item end-to-end**
Steps: Run TC-3.3 → TC-3.12 for one bulk item.
Expected: Behaves identically to a single task.

---

## MODULE 5 — MACHINE CLEANING & CIP (operations01)

**TC-5.1 Checklist structure**
Steps: Cleaning & Sanitization → select M002.
Expected: 13 steps in order: Serving Counter, Can Dispensing Mesh, Under Can Mesh, Drink Dispensing Mesh, Under Drink Mesh, Drink Nozzle, Blending Area, Blender Jar / Blender Unit Cleaning, CIP, Drip Tray, Waste Collection Area, Bin Slot Area, Machine Door Inner Surface.

**TC-5.2 Photo mandatory for normal steps**
Steps: Try Mark Complete on a normal step without a photo.
Expected: Button disabled / error until photo uploaded.

**TC-5.3 CIP line-by-line flow**
Steps: On the CIP card: tap line L1 → button reads "Start Hot Water Pump — Liquid Line L1" → click it.
Expected: Blue water-flow animation shows ~2.5s; L1 turns green "Completed"; counter "1/11 lines done".

**TC-5.4 CIP stop-pump gating**
Steps: Check Stop Hot Water Pump button before all lines done.
Expected: Disabled until all 11 lines (L1–L10 + Water/L11) are Completed.

**TC-5.5 CIP completion (photo optional)**
Steps: Flush all 11 lines → Stop Hot Water Pump → Mark CIP Complete WITHOUT uploading a photo.
Expected: CIP completes successfully; timeline gets "CIP Completed".

**TC-5.6 Complete whole checklist**
Steps: Finish remaining steps with photos.
Expected: Task Completed; machine last-cleaning date updates; supervisor notified.

**TC-5.7 Supervisor tracking** (operations_sup01)
Steps: Cleaning & Sanitization Tracking → filters (machine/staff/status/date) → click M002 row.
Expected: Row shows status/steps/photo count/review status; detail dialog lists all 13 steps with completed-by + time; photo icon opens proof; Add Comment / Mark Reviewed / Escalate all work (escalate notifies operations staff).

---

## MODULE 6 — KITCHEN EXTRAS (kitchen01)

**TC-6.1 Menu order**
Expected: Sidebar order: Dashboard, Preparation Requests, Cleaning Bins, Bin Filling, Bin Storage, Scanned Bin History, Change Requests, Notifications.

**TC-6.2 Bin identity de-machined**
Steps: Open Bin Filling and Bin Storage.
Expected: Cards show "Ticket: XXXXXXXX" (and Bin ID) — machine name is not the bin identity.

**TC-6.3 Change request round trip**
Steps: Change Requests → raise new request with reason → login supervisor → see notification → back as kitchen → Resolve.
Expected: Status Open → Resolved; supervisor notified.

---

## MODULE 7 — OPERATIONS EXTRAS (operations01)

**TC-7.1 Menu rename**
Expected: Sidebar shows "Machine Bin Status" (not "Bins"); page title matches; Assigned Machines action card also renamed.

**TC-7.2 Machine Bin Status content**
Steps: Open Machine Bin Status → M001.
Expected: Solid/Liquid/Powder bins + Other consumables incl. Cup Dispenser (cap 200, 12%), Water Cans, Waste Water Cans with fill %.

**TC-7.3 Door Control audit**
Steps: Door Control → M002 → Open Door → Close Door → Confirm Closed.
Expected: Three log entries with actor + timestamp.

---

## MODULE 8 — DASHBOARD INTERACTIVITY (all roles)

**TC-8.1 Supervisor cards**
Steps: Click each dashboard card.
Expected: "Machines with Low Stock" → Alerts filtered by Low Stock (header shows "Filtered by: Low Stock"); "Pending Kitchen Preparation" → Kitchen Prep Status filtered Pending; "Cleaning Pending" → Cleaning Tracking; sales cards → Reports.

**TC-8.2 Operations cards**
Expected: Pickups → Pickup List; Replacements → Bin Replacement Tasks; Cleaning → Cleaning page; machine tiles → Machine Bin Status for that machine.

**TC-8.3 Kitchen cards**
Expected: Pending → Preparation Requests; In Progress → Bin Filling; Ready → Bin Storage; Cleaning → Cleaning Bins.

**TC-8.4 Technician & Maintenance Supervisor cards** (tech01 / maintenance_sup01)
Expected: Work order, spare parts, health cards all navigate to their pages.

---

## MODULE 9 — MAINTENANCE (maintenance_sup01 / tech01)

**TC-9.1** Technical Alerts: 3 seeded alerts visible with priorities.
**TC-9.2** Assign the unassigned work order to tech01 → tech01 sees it, accepts, advances stages.
**TC-9.3** tech01 raises Spare Parts Request → maintenance_sup01 approves it.
**TC-9.4** Machine Health Center / PM Planner / Escalations render data (2 overdue PMs, 1 open escalation).

---

## MODULE 10 — REPORTS & ADMIN

**TC-10.1 Reports** (operations_sup01): Sales by machine/drink (M002 top seller), replacement history, cleaning history, activity log — completed flows from Modules 3–5 appear.
**TC-10.2 Notifications**: Bell icon shows unread count; new notifications arrive after assignments/completions.
**TC-10.3 Admin data status** (admin01): counts grid populated for 14 collections.
**TC-10.4 Demo Reset**: Click Reset Demo Data → confirm → all demo scenarios restored (verify Alerts, Pickup List, Cleaning Bins repopulate); safe to run twice.

---

## Pass criteria
- All negative cases show the specified error messages (not generic failures).
- No console errors / blank screens on any page.
- Every completed action appears in Live Task Progress, Notifications and Reports.

**Automated backup check:** `python3 /app/scripts/e2e_test.py` → 29/29 pass (WARNING: it resets the database).
