# tare — Maintenance App (Protein Hulk Maintenance App)

## Brand
- Brand name: **tare** (lowercase wordmark), tagline "Measured to the gram."
- Visual theme: per uploaded Tare Brand Book — Bone/Oat/Stone/Clay/Ink/Beet color palette, Archivo (display) + Inter (body) + Space Mono (mono/data) fonts. Already implemented in `design_guidelines.json` and `index.css` — do not re-theme.

## Original Problem Statement (authoritative functional spec, pasted by user 2026-02)
Operations/maintenance platform for automated drink-vending machines. FastAPI + MongoDB (motor) backend, React + Tailwind + shadcn/ui frontend. Custom username/password auth (no 3rd-party auth), account locks after >5 failed attempts (supervisor can unlock).

**Scope**: Fully build **Kitchen Staff**, **Operations Staff**, and **Operations Supervisor** modules. Maintenance Technician / Maintenance Supervisor / Admin can log in but do not require dedicated UI (spec-compliant — Admin shows a "This module is not yet available" screen; Technician & Maintenance Supervisor happen to already be fully built as bonus features from an earlier iteration and are kept).

### Users (password `1234` for all)
| user_id | role | assigned machines |
|---|---|---|
| kitchen01 | Kitchen Staff | – |
| operations01 | Operations Staff | M001, M002, M003 |
| operations02 | Operations Staff | M004, M005 |
| operations_sup01 | Operations Supervisor | – |
| tech01 | Maintenance Technician | – |
| maintenance_sup01 | Maintenance Supervisor | – |
| admin01 | Admin | – |

### Machines
M001 Gachibowli (Running), M002 Hitech City (Warning), M003 Jubilee Hills (Running), M004 Kondapur (Warning), M005 Financial District (Running). Each has 40 slots (L1-10 liquid, P1-10 powder, S1-10 solid, + Water/Ice/CanDispenser/LidDispenser/WC1/WC2/SN1/WWC1-3).

### Ingredient Master, Recipes D1-D20, refill quantity logic (max recipe usage × 120 cups)
Implemented exactly per spec in `backend/seed_constants.py`.

### Global Display Rule
Every machine ID shown to users is rendered as `M001 – Gachibowli` (backend pre-composes `machine_label` field; frontend consumes directly).

### Core Workflow (validated end-to-end)
Supervisor sees Alert → Assign Operations Staff + Create Kitchen Fill Ticket → Kitchen scans/cleans/saves bin (Ready for Pickup) → Operations Staff scans + loads trolley → 4-step bin replacement (remove old, scan new bin, scan slot, scan removed old bin) → slot refills to 100% → Dirty bin → Return to Kitchen → 6-stage cleaning lifecycle → Supervisor Live Task Progress + Reports reflect completion.

## Architecture
```
/app/backend/
  server.py            # FastAPI entrypoint, registers all routers (auth, catalog, alerts, kitchen, operations, maintenance, admin, reports, supervisor)
  seed_constants.py    # MACHINES, USERS, ingredient master, D1-D20 recipes, machine_label(), recipes_using()
  seed.py               # DB seeding (idempotent) + demo pipeline progression
  auth_utils.py         # JWT, password hashing, lockout threshold (>5 failures)
  database.py           # motor client, serialize/serialize_list helpers
  utils.py               # push_progress, push_notification, log_activity
  workflow.py            # create_replacement_pipeline shared logic
  routers/
    auth.py, catalog.py, alerts.py, kitchen.py, operations.py,
    supervisor.py, maintenance.py, admin.py, reports.py
/app/frontend/src/
  App.js                       # routes, role guards
  context/AuthContext.jsx      # login state, ROLE_HOME redirect map
  lib/api.js                    # axios instance
  components/layout/Sidebar.jsx, DashboardLayout.jsx
  components/shared/            # StatusBadge, KPICard, SearchableSelect, Timeline, QRScanSim,
                                  RecentScanPanel, PageHeader, DataTable, NotificationsList, ReportViewer
  pages/
    Login.jsx, RoleNotAvailable.jsx
    supervisor/  (Dashboard, MachineControlCenter, Alerts, AlertDetail, TaskAssignment,
                   PreScheduleTasks, PreScheduleBulk, LiveTaskProgress, KitchenPreparationStatus,
                   OperationsStaffTasks, Reports, UserAccessManagement)
    kitchen/     (Dashboard, Requests, BinFilling-equivalent flows, Storage, History,
                   ChangeRequests-equivalent, CleaningBins)
    operations/  (Dashboard, AssignedMachines, PickupList, BinReplacementTasks, DoorControl,
                   Cleaning, DirtyBinReturn, ReplacementHistory, Notifications)
    technician/, maintSup/  (bonus, fully built, not required by spec but kept)
/app/scripts/e2e_test.py   # 29-step backend E2E smoke test (admin reset -> full pipeline -> reports)
```

## What's Been Implemented (2026-02, this session)
- **Fixed CRITICAL bug**: `supervisor.py` router was never registered in `server.py` — every `/api/supervisor/*` endpoint (Dashboard, Task Assignment, Live Task Progress, Kitchen Prep Status, User & Access Management) was silently 404ing. Fixed.
- **Fixed CRITICAL bug**: `App.js` imported 15 frontend page files that didn't exist (all `pages/admin/*` + `maintSup/Reports.jsx`, `Escalations.jsx`, `Notifications.jsx`) — app failed to compile entirely. Fixed by building the 3 missing MaintSup pages (backend was already ready) and replacing the unbuilt Admin module with a spec-compliant `RoleNotAvailable` screen.
- Added dedicated **Alert Detail page** (`/supervisor/alert/:id`) replacing the old modal-only pattern — reachable from both the Alerts list (row click) and Machine Control Center (slot click → `POST /api/alerts/ensure` → navigate). Includes 17 read-only fields, Recipes Affected, Suggested Action, and 5 action buttons (Assign Staff modal w/ start/due time + priority + comment + Assign Task/Assign and Notify, Create Kitchen Fill Ticket, Assign and Create Kitchen Ticket, Email Kitchen Staff with 30-min-gate + live countdown tooltip, Close).
- Added `POST /api/alerts/ensure` (idempotent find-or-create) and `POST /api/alerts/{id}/email-kitchen` (simulated escalation with validation: no ticket / already picked up / <30 min old) endpoints.
- Added `POST /api/supervisor/tasks/{id}/{reassign|priority|comment}` endpoints + wired into a filterable Operations Staff Tasks table (machine/status/staff filters + inline reassign/priority/comment actions per row).
- Added 5-second polling to Live Task Progress page.
- Fixed exact error message text across kitchen bin-scan/save and operations pickup-scan flows to match spec wording.
- Adjusted login lockout to trigger after the 6th failed attempt (`failed_attempts > 5`) per spec wording "more than 5".
- Rebranded app from "Protein Hulk" → **tare** (Login page + Sidebar), fixed a literal `\u2022` placeholder-escaping bug on the password field.
- Wrote `/app/scripts/e2e_test.py` — full 12-stage pipeline as a 29-assertion script; passes 29/29 against the live backend.
- Full testing pass via `testing_agent_v4`: 100% backend (29/29 E2E) + 100% manually-verified frontend flows. No critical or blocking issues found.

## Known Minor/Optional Items (not blocking)
- CORS `allow_origins` defaults to `*` with `allow_credentials=True` (env-var override available via `CORS_ORIGINS`) — works fine in this environment per testing confirmation; a stricter setup would set explicit origins.
- MaintSup Reports page uses native date inputs instead of shadcn calendar — cosmetic, module is bonus/out-of-scope.

## P1/P2 Backlog (not started, lower priority per spec)
- App-wide `machineLabel(id)` frontend helper (currently backend pre-composes labels server-side, which already satisfies the Global Display Rule — a frontend helper would only be needed if any raw IDs are found rendered without labels in the future).
- Further polish: Kitchen BinFilling flow field-for-field parity check against the literal spec field list (Machine, Location, Slot ID, Slot Type, Ingredient Name, Required Full Capacity, Unit, Expiry auto, Replacement Due auto) — current implementation covers these but wasn't re-audited field-by-field this session.
- Bulk Pre-Schedule Replacements (`PreScheduleBulk.jsx` + `/api/bulk-orders`) already exists from an earlier iteration matching the spec's "follow-up" ask — not re-verified this session, worth a smoke test if revisited.

## Demo Scenario Seeding (added 2026-07-07)
`/app/backend/seed_demo.py` (called from `run_seed`, self-guarded/idempotent per scenario, survives `reset_and_reseed`):
- Real user profiles: Rakesh Kumar (kitchen01), Anil Verma (operations01), Suresh Reddy (operations02), Priya Sharma (operations_sup01), Vikram Singh (tech01), Ravi Patel (maintenance_sup01), System Admin (admin01) + @proteinhulk.com emails.
- Bulk Pre-Schedule order on M004 → operations02 (L4 + P1 kitchen-required Pending, S3 auto-fulfilled Ready for Pickup).
- Mid-flow pre-schedule task M002-L1 Coconut Milk (waiting for kitchen) → operations01.
- Completed replacement DEMO-BRT-001 (M003 Strawberry) with 8-stage live_task_progress timeline.
- Cleaning-bin lifecycle: BIN-DEMO-OLD-1 "Washing Pending", BIN-DEMO-OLD-2 "Returned to Kitchen".
- Machine cleaning: M001 today 3/11 steps done (mock photos), M003 yesterday Completed.
- Open change request DEMO-CR-001 (kitchen01), 6 recent activity log entries.

## Admin Demo Reset + Demo Script (2026-07-07)
- `/app/frontend/src/pages/admin/Dashboard.jsx`: Admin Dashboard with "Reset Demo Data" button (POST /api/admin/mock-data/reset → reset_and_reseed → base seed + demo scenarios) and live collection-count grid. Route /admin/dashboard now real (AdminNotAvailable removed).
- `/app/DEMO_TEST_SCRIPT.md`: full presenter/test script — 8 scenarios (login security, alert→replacement e2e, bulk pre-schedule, machine cleaning, change requests, door control, maintenance, analytics/admin) + regression checklist.

## Cleaning Bins One-Click (2026-07-08)
- Kitchen Cleaning Bins now shows a read-only 6-step Cleaning Guide per bin + single "Mark as Cleaned — Ready for Filling" button.
- New endpoint: POST /api/kitchen/cleaning-bins/{return_id}/complete (jumps straight to Clean / Ready for Filling, updates bin_storage, progress + activity log). Old /advance endpoint still exists (used by e2e).

## Cleaning Checklist Update (2026-07-09)
- Added "Blender Jar / Blender Unit Cleaning" step (after "Blending Area") to CLEANING_STEPS — checklist is now 12 steps. Existing in-progress cleaning tasks patched in DB; new tasks include it automatically.
