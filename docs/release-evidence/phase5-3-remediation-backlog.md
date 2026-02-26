# Phase 5.3 — remediation backlog from manual UAT (NO GO)

Date opened: 2026-02-26
Source: manual UAT findings during Phase 5.3 checklist execution
Status: Open

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
