# Phase 5.3 — remediation backlog from manual UAT (NO GO)

Date opened: 2026-02-26
Source: manual UAT findings during Phase 5.3 checklist execution
Status: Open

Current execution phase: Phase 3 in progress (pickup request lifecycle clarity).

## Sev1 (release-blocking)

| ID | Area | Finding | Expected behavior | Proposed implementation | Validation |
| --- | --- | --- | --- | --- | --- |
| P53-001 | Driver auth | Driver has no logout path. | Driver can log out and re-auth cleanly. | Add explicit logout action in driver shell/nav; clear session and route to login; add e2e/auth test for logout/login roundtrip. | Driver logs out, hits protected route, is redirected to login, then can log in again. |
| P53-002 | Portal auth/onboarding | First-login forced password change did not trigger. | Portal users must change password before proceeding on first login (and if still default on later login). | Add server-checked `must_change_password` gate; block onboarding routes until password updated; run check at each login for default/temporary credential state. | New portal user cannot access onboarding until password changed; regression covers subsequent login when flag is still true. |
| P53-003 | Check-in data integrity | Intake job linking path fails and save/refresh state is not persistent. | Check-in save succeeds and persists after refresh without relation failures. | Audit `intake_jobs` relation query/write path; enforce null-safe query handling and transaction-safe link creation; add persistence test for create-save-refresh cycle. | Check-in user can create/update, refresh page, and see identical saved state with linked jobs. |
| P53-004 | File validation | HEIC/video uploads appear selectable but do not persist reliably. | Unsupported files are blocked with clear validation errors before upload attempt. | Add explicit MIME/extension whitelist and per-file error toasts; prevent submit when invalid files selected; show accepted formats in UI copy. | HEIC/video rejected immediately with actionable message; supported files upload and persist. |
| P53-005 | Wholesale pickup request | Request pickup appears non-functional/confusing. | One clear action schedules next route pickup and confirms status; user can add rugs until completion. | Simplify pickup CTA and state model (requested/scheduled/completed); surface next-available date and confirmation banner; preserve rug add/edit before completion. | Portal user requests pickup, sees confirmed scheduled state/date, adds rugs, office/driver can see request. |

## Sev2 (must fix or formally defer with owner/date)

| ID | Area | Finding | Expected behavior | Proposed implementation | Validation |
| --- | --- | --- | --- | --- | --- |
| P53-006 | Check-in UX | Pickups tab is confusing for check-in users. | Check-in view focuses on check-in tasks; delivery workload is clearly named/scoped. | Rename/re-scope tab to delivery context or remove from check-in role; gate by role and workflow stage. | Check-in role sees only relevant actions and labels. |
| P53-007 | Estimate workflow | Estimate handling needs richer portal presentation and clearer accept/reject UX. | Estimates are shown as clear cards/details with photos and decision controls. | Add estimate detail cards with photo gallery and explicit accept/reject actions; persist decision notes; show confirmation events. | Portal user can review each estimate in detail and submit decision reliably. |
| P53-008 | Invoice automation | Invoicing must auto-generate/send on route confirmation; walk-ins need simple flow. | Route confirmation triggers invoice generation/email for stops; walk-in invoice flow is minimal and fast. | Add route-confirmation invoice batch job + email dispatch and retry visibility; add streamlined walk-in invoice action. | Driver route confirmation produces invoices and sends emails; walk-in invoice can be created/sent quickly. |
| P53-009 | Alerts/reminders | Operational reminders/alerts need more robust functionality. | Actionable alerts with ownership, severity, and resolution state. | Expand alerts schema/UI with severity, assignee, due date, resolution, and audit history. | Ops users can triage and close alerts with traceable ownership. |
| P53-010 | Search/profile | Need search by rug number/client and editable rug profiles. | Office can search globally; portal can search own rugs by rug number. | Add indexed search endpoints and UI; add rug profile page with controlled office edits + audit log. | Search returns correct rugs quickly; office edits are persisted and audited. |

## Sev3 candidates (design/process enhancements)

| ID | Area | Finding | Expected behavior | Proposed implementation | Validation |
| --- | --- | --- | --- | --- | --- |
| P53-011 | Rug lifecycle visibility | Active vs history organization unclear for wholesale users. | Active rugs visible until delivered/invoiced, then moved to history by date. | Add Active/History tabs driven by lifecycle state transitions from delivery confirmation. | Rug moves from active to history at delivery completion with timestamp. |
| P53-012 | Driver mixed stop workflow | Pickup/delivery should be interchangeable at same stop with signatures. | Driver can process pickup + delivery in one stop flow with signatures/photos. | Unify stop workflow to support both directions and collect signatures/evidence per action. | Driver completes mixed stop without switching workflows; evidence saved to both records. |

## Release-gate rule

Phase 5.3 remains **NO GO** until Sev1 items are closed and Sev2 items are either closed or formally accepted with owner + target date.

## Phased execution plan (requested)

### Phase 0 — Stabilize branch and evidence contract (Day 0)

**Goal:** ensure we are fixing against one known candidate and logging every result in one place.

- Freeze new feature work on release candidate branch until Sev1 remediation pass is complete.
- Keep `docs/release-evidence/phase5-3-uat-execution.md` as the single manual test log.
- Track implementation progress in this remediation file by ID (`P53-001` ... `P53-012`).

**Exit criteria:**
- Branch selected for remediation.
- Owners assigned to all Sev1 items.
- UAT evidence doc updated with run date/operator.

### Phase 1 — Sev1 auth and session blockers (Day 0-1)

**Scope:** `P53-001`, `P53-002`.

- Driver logout/re-auth must be functional from driver workspace.
- Wholesale portal must enforce password update before first workflow access.

**Validation:**
- Manual UAT Auth/session checklist for Driver + Portal passes.
- Add/update automated auth-path tests where feasible.

**Exit criteria:**
- `P53-001` closed.
- `P53-002` closed.

### Phase 2 — Sev1 check-in data integrity and file validation (Day 1-2)

**Scope:** `P53-003`, `P53-004`.

- Fix intake job linking and save/refresh persistence regression.
- Enforce upload type validation (reject unsupported HEIC/video with explicit errors).

**Validation:**
- Re-run Facility/check-in manual checklist.
- Add regression tests for create/save/refresh and invalid file handling.

**Exit criteria:**
- `P53-003` closed.
- `P53-004` closed.

### Phase 3 — Sev1 pickup request UX/functionality (Day 2-3)

**Scope:** `P53-005`.

- Simplify portal pickup request lifecycle to one clear “request next route pickup” path.
- Ensure request state is visible and editable until completion.

**Validation:**
- Portal pickup scenario pass (request -> confirmation -> rug additions visible to office/driver).

**Exit criteria:**
- `P53-005` closed.

### Phase 4 — Sev2 operational workflow pass (Day 3-5)

**Scope:** `P53-006` to `P53-010`.

- Improve check-in pickup/delivery UX clarity.
- Improve estimate review/decision presentation.
- Implement invoice automation path and walk-in simplification.
- Expand operational reminders/alerts utility.
- Deliver rug search/profile usability improvements.

**Validation:**
- Office, Wholesale portal, and Driver manual sections re-tested.
- Any deferred Sev2 item must include owner + target date + risk note.

**Exit criteria:**
- All Sev2 closed, or explicitly accepted with owner/date.

### Phase 5 — Closeout and GO/NO-GO decision (Day 5)

- Run full gate scripts and capture evidence:
  - `./scripts/phase5-3-prelive-gate.sh`
  - `./scripts/phase5-3-run-and-capture.sh`
  - `./scripts/phase5-3-apply-automated-results.sh`
- Re-run manual UAT checklist and update severity counts.
- Execute closeout gate:
  - `./scripts/phase5-3-validate-and-close.sh`

**Exit criteria:**
- No open Sev1.
- No open Sev2 without formal acceptance.
- Engineering and Operations decisions recorded as GO.
