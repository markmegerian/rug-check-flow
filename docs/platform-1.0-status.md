# Platform 1.0 Status Tracker

_Last updated: 2026-04-16_

This is the living reality-check document for the project.

Use this as the **current implementation status**, not the older roadmap docs alone. The roadmap docs still matter for intent and sequencing, but they can lag behind the actual codebase.

## Update rules

Whenever meaningful work lands, update this document in the same change set when possible.

At minimum, record:
- what changed
- whether it moves a workstream to **Built**, **Partial**, or **Not built**
- any important schema or workflow drift discovered during implementation
- any new subsystem added that was not explicitly listed in the original roadmap
- relevant migrations, scripts, functions, or UI entry points

If a roadmap item is now outdated, do **not** silently delete history. Instead:
- keep the original roadmap doc as planning context
- reflect the new reality here
- note what changed and why

---

## Snapshot summary

### Built enough to rely on
- Unified Stop model (`route_stops`, `route_stop_items`, `route_stop_events`)
- Driver Stop portal UI
- Offline queue + sync loop for stop events/photos
- Ingest-stop-events edge function
- Disputes table + driver dispute/exception flows
- Delivery Prep facility workflow
- Accounting primitives (`payments`, `payment_allocations`, `credit_memos`, `credit_memo_lines`)
- Invoice immutability and balance sync triggers
- Invoice PDF generation/download path
- Invoice client-link guard + automated smoke coverage
- Check-In backend workflow edge function plus frontend cutover (`check-in-workflow`)
- Estimate backend workflow edge function plus frontend cutover (`estimate-workflow`)
- Handoff invoice backend workflow edge function plus frontend cutover (`generate-invoice-workflow`)
- `clients.company_id` and `portal_users.company_id` rollout + type sync + CI smoke
- Phase A company scope rollout for `rugs`, `invoices`, and `payments` (migration + autofill triggers)
- Phase B company scope rollout for `approved_estimates`, `service_completions`, and `client_service_selections` (migration + autofill triggers)

### Still incomplete / ongoing
- Company scoping mostly complete, but live audit on 2026-04-16 found `rugs.company_id` still has 10 null rows in prod even though the newer consistency triggers are active
- Stronger “pure DB” enforcement for some stop workflow invariants if desired
- Release evidence / rollout discipline beyond branch deploy health
- Live scheduler wiring / production execution verification for reminder cadence
- Full production smoke evidence for the newly shipped messaging/reminder flows
- Durable idempotency persistence for repeated Check-In submissions / retries remains open

### Recently clarified
- The backend-owned workflow pattern is now the practical direction for critical multi-step write flows, not just Check-In.
- Check-In, estimate creation/revision, and handoff invoice generation are now all cut over in the app code, but rollout evidence quality still varies by workflow.

---

## Workstream review

## 0) Facility Check-In workflow
**Status:** Partial

### What exists
- Frontend submit path is now cut over:
  - `src/components/facility/CheckInLayout.tsx`
  - uses `safeInvoke<CheckInWorkflowResponse>("check-in-workflow", ...)`
- Check-In UI/form components still in use:
  - `src/components/facility/CheckInLayout.tsx`
  - `src/components/facility/CheckInForm.tsx`
- Supporting helpers still present around the workflow:
  - `src/lib/checkin-operations.ts`
  - `src/lib/rug-service-approval.ts`
  - `src/lib/rug-operations.ts`
- Recent shipped stabilization work on branch `claude/codebase-analysis-ideas-JJIeo`:
  - reduced repeated queries
  - reduced blocking submit-path work
  - guaranteed full form reset after success
  - locked cleaning-only estimate skip behavior with tests
  - locked cleaning auto-approval behavior with tests
- Contract + backend workflow implementation:
  - `docs/check-in-backend-workflow-contract.md`
  - `supabase/functions/check-in-workflow/index.ts`
  - `supabase/config.toml`
  - `src/test/check-in-workflow-edge.test.ts`
  - `src/test/check-in-frontend-cutover.test.ts`

### What is still missing
- Durable idempotency persistence for repeated submissions / retries

### Notes
- The edge function now owns create/edit orchestration, company-scoped auth, backend-owned approval defaults, estimate draft creation, and estimate batch queue seeding.
- Photo upload prep remains client-side by design.
- Authenticated production UI smoke passed on 2026-04-16 from `https://mr.rugboost.com/checkin` using the check-in staff account, creating walk-in rug `E2E-CI-899980` via `functions/v1/check-in-workflow` and returning success with rug id `86d31747-71b8-4a32-a02e-adf3ff904dd8` and intake job id `1a22cb68-79b1-4a36-ac8e-2f7934b4ccf4`.
- Obsolete browser-owned estimate-draft orchestration was removed from `src/lib/checkin-operations.ts`; the file now only handles photo upload prep.
- This workstream is no longer blocked on frontend cutover or rollout proof. The remaining gap is idempotency hardening.

---


## 1) Unified Stop model
**Status:** Built

### What exists
- Migration: `supabase/migrations/20260305000000_add_route_stops_unified_model.sql`
- Core tables:
  - `route_stops`
  - `route_stop_items`
  - `route_stop_events`
- Stop generation function:
  - `build_route_stops_for_date(date)`
- Driver-facing stop UI:
  - `src/pages/StopPortal.tsx`
  - `src/components/driver/RouteListView.tsx`
  - `src/components/driver/StopDetailView.tsx`
- Stop query/mapping logic:
  - `src/hooks/useRouteStops.ts`
- Office visibility/proof tooling:
  - `src/components/office/DeliveryProofBoard.tsx`
  - `src/components/office/RouteBuilder.tsx`

### Notes
- This is no longer a future concept. It is in the schema and app.
- Remaining work in this area is refinement, rollout confidence, and cleanup — not first implementation.

---

## 2) Offline-first driver operation
**Status:** Partial, but real

### What exists
- IndexedDB/Dexie queue:
  - `src/lib/offline-queue.ts`
- Sync engine:
  - `src/lib/offline-sync.ts`
- Hook/context integration:
  - `src/hooks/useOfflineQueue.ts`
  - `src/hooks/useRouteStops.ts`
- Event ingestion backend:
  - `supabase/functions/ingest-stop-events/index.ts`
- Event idempotency:
  - `route_stop_events.offline_event_id` unique
- Pending photo upload flow:
  - queue first, upload later, emit `PHOTO_ATTACHED`

### Notes
- This is not just scaffolding; it is implemented.
- Still worth continued hardening through real-world usage and acceptance testing.
- Photos currently reuse the `pickup-photos` bucket/path strategy; that may be good enough or may later deserve a dedicated delivery naming/storage approach.

---

## 3) Driver stop completion, disputes, and exceptions
**Status:** Built

### What exists
- Dispute UI:
  - `src/components/driver/DisputeDialog.tsx`
- Exception UI:
  - `src/components/driver/ExceptionDialog.tsx`
- Hook methods:
  - `handleDispute()`
  - `handleException()`
  - `completeStop()`
- Ingested event handling includes:
  - `ITEM_DISPUTED`
  - `ITEM_EXCEPTION`
  - `STOP_COMPLETED`
- Schema:
  - `disputes`
  - `dispute_type`
  - `dispute_status`

### Notes
- Core dispute capture is implemented.
- Office-side dispute workflow/lifecycle may still need polish depending on product expectations.

---

## 4) Delivery Prep / day-before confirmation
**Status:** Built

### What exists
- Facility view:
  - `src/components/facility/DeliveryPrepTab.tsx`
- Delivery list item flags already used in workflow:
  - `confirmed_for_delivery`
  - `loaded_on_truck`

### Notes
- The roadmap item exists in code.
- Remaining work here is likely UX/process tuning, not foundational implementation.

---

## 5) Accounting primitives
**Status:** Built

### What exists
- Billing hardening migrations:
  - `supabase/migrations/20260305110000_harden_billing_production.sql`
  - `supabase/migrations/20260306010000_pr5_billing_hardening_followup.sql`
- Tables/features:
  - `payments`
  - `payment_allocations`
  - `credit_memos`
  - `credit_memo_lines`
  - invoice `balance_due`
  - recompute/sync triggers
- Office UI support:
  - `src/components/office/InvoicesTab.tsx`
    - record payments
    - allocate payments
    - issue credit memos

### Notes
- This area is substantially implemented.
- Remaining risk is more about consistency, scoping, and workflow validation than feature absence.

---

## 6) Invoice immutability and billing hardening
**Status:** Built

### What exists
- Locked invoice triggers for financial updates and item mutations
- Invoice balance recomputation triggers
- `disputed` invoice status support
- Invoice PDF function:
  - `supabase/functions/invoice-pdf/index.ts`
- Additional hardening added on 2026-03-28:
  - `supabase/migrations/20260328185000_prevent_unlinked_invoices.sql`

### Added verification coverage
- `scripts/invoice-client-link-guard.sh`
- `scripts/invoice-authenticated-smoke.sh`

### Notes
- Historical orphan invoice artifact remains intentionally untouched.
- New unlinked invoices are blocked at the DB layer.

---

## 7) Company scoping / tenancy rollout
**Status:** Partial and still a major remaining track

### What is done
- `clients.company_id` added and live
- `portal_users.company_id` added and live
- Insert-time autofill triggers added/fixed
- Generated Supabase types updated
- Smoke coverage added:
  - `scripts/company-scope-column-smoke.sh`
- CI coverage added for column presence and invoice/link guards

### Recent migrations
- `20260328211000_add_company_scope_to_clients_and_portal_users.sql`
- `20260328212000_fix_company_scope_insert_triggers.sql`
- `20260329090000_add_company_scope_to_rugs_invoices_payments.sql`
- `20260329091000_add_company_scope_to_estimate_workflow_tables.sql`
- `20260330074500_enforce_company_scope_consistency.sql`

### Current rollout state
Direct company ownership columns are now present on:
- `rugs`
- `invoices`
- `payments`
- `approved_estimates`
- `client_service_selections`
- `service_completions`

### Notes
- Detailed rollout plan now lives in `docs/company-scope-rollout-plan.md`.
- Repeatable audit scripts: `scripts/company-scope-audit.sh` and `scripts/company-ownership-bootstrap-audit.sh`.
- Phase 0 bootstrap artifacts live in repo: `scripts/sql/bootstrap-company-ownership.sql` and `scripts/company-ownership-bootstrap-smoke.sh`.
- Phase 0 bootstrap is completed in prod: `companies` has 1 row, `company_memberships` has an initial `company_admin`, and all 902 clients now have non-null `company_id`.
- Live audit on 2026-04-16 showed: `clients.company_id` null rows = 0, `invoices.company_id` null rows = 0, `payments.company_id` null rows = 0, `approved_estimates.company_id` null rows = 0, `client_service_selections.company_id` null rows = 0, `service_completions.company_id` null rows = 0, and `rugs.company_id` null rows = 10.
- Prod trigger enforcement was verified directly on 2026-04-16 with authenticated office-token insert attempts that were rejected with DB constraint `23514`:
  - `invoices.company_id must match clients.company_id`
  - `rugs.company_id must match clients.company_id`
- New DB consistency triggers now enforce that company-scoped workflow rows cannot drift away from their parent company linkage on insert/update, even if application code passes the wrong `company_id`.

---

## 8) DB-enforced workflow/state-machine guarantees
**Status:** Partial

### What exists
- Route stop status transition validation in DB migration layer
- Route stop item status transition guards
- Completion invariants for stop status changes
- Invoice immutability enforced via triggers

### Notes
- Some workflow safety is still effectively enforced in the edge function and app flow rather than entirely via DB-only contracts.
- Whether this is “done” depends on product architecture goals:
  - if goal is robust behavior, this is already far along
  - if goal is strict DB-native authority for all core transitions, more work remains

---

## 9) Messaging threads / Office Inbox
**Status:** Built enough to rely on

### What exists
- Generic `interactions` table
- `communication_events` table
- Shared structured thread tables already present in schema:
  - `message_threads`
  - `messages`
- Office Inbox UI:
  - `src/components/office/InboxTab.tsx`
  - wired into `src/pages/Operations.tsx`
- Portal messaging UI:
  - `src/components/portal/PortalMessagesTab.tsx`
  - wired into `src/pages/WholesalePortal.tsx`
- Shared thread context labeling helper:
  - `src/lib/message-threads.ts`
- Shared thread navigation helper:
  - `src/lib/thread-navigation.ts`
- Shared thread lifecycle helper:
  - `src/lib/thread-lifecycle.ts`
- Current thread types supported in UI:
  - `general`
  - `estimate`
  - `invoice`
- Deep-link/open-or-create routing from estimate and invoice context exists on both office and portal surfaces
- Thread lifecycle controls now exist:
  - unread derivation
  - close / archive / reopen
  - filtering by status and unread
  - consistent thread sorting rules

### What is still missing
- True realtime subscriptions/read receipts if you want a fully live chat-grade inbox beyond refresh + polling
- Richer assignment/ownership/search features if desired
- Longer-term portal auth hardening away from email-based identity matching

### Notes
- This workstream is now present in mounted UI, wired across office and portal, tied into reminder delivery/system messages, and has post-audit fixes for deep-linking, portal preview privacy, sender rendering, and live refresh affordances.

---

## 10) Reminder cadence automation
**Status:** Built enough to rely on

### What exists
- Operational alerts function:
  - `supabase/functions/operational-alerts/index.ts`
- Dashboard reminders panel:
  - `src/components/dashboard/OperationalRemindersPanel.tsx`
- Shared cadence rules:
  - `src/lib/notification-cadence.ts`
- Shared cadence seeding store:
  - `src/lib/notification-cadence-store.ts`
- Cadence tests:
  - `src/test/notification-cadence.test.ts`
- Office visibility for client reminder state:
  - `src/components/office/NotificationCadenceCard.tsx`
- Due reminder processor:
  - `supabase/functions/process-notification-cadence/index.ts`
- Shared reminder delivery copy helper:
  - `supabase/functions/_shared/reminder-delivery.ts`
- Implemented estimate cadence:
  - +24h
  - +72h
  - +7d
- Implemented invoice cadence:
  - 3d before due
  - due date
  - 7d overdue
  - 14d overdue
  - weekly statement
- Per-client throttled collections cadence:
  - 72h throttle enforcement
- Reminder sends now:
  - attempt provider delivery
  - log to `communication_events`
  - reflect into shared message threads as system messages
  - remain retryable on failure

### What is still missing
- Final row-claiming/locking hardening if you want fully robust concurrent processor execution
- Optional manual suppression/override UX if product wants operator-level snooze controls
- Delivery/provider cleanup for reminder emails that currently fail downstream in prod (`Resend failed (403)` / `Resend failed (422)`)

### Notes
- The cadence/delivery model now exists in app code, tests, UI, and edge function processing.
- `process-notification-cadence` was corrected on 2026-04-16 to use `verify_jwt = false`, matching its intended dual auth model (`Authorization` for manual office/admin invocation, `x-cron-secret` for scheduler invocation). Before that fix, the prod gateway rejected manual invocation with `UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM`.
- Prod verification on 2026-04-16 exposed two separate manual-path blockers and both were fixed: internal office smoke users were missing `company_memberships`, and large-company manual runs were building an oversized `client_id in (...)` filter that PostgREST rejected with `400 Bad Request`.
- A live migration (`20260416225000_backfill_internal_company_memberships.sql`) was pushed to backfill facility `company_memberships` for internal `user_roles` (`admin`, `office`, `checkin_staff`, `driver`, `staff`) in the single-company RugBoost tenant.
- After the migration and function redeploy, prod manual dry-run invocation from `test@office.com` succeeded with `200 { success: true, dry_run: true, mode: "manual", processed: [...] }` and returned 50 due cadence rows for the linked facility company. `codex@gpt.com` also now resolves to the same facility `company_id` in prod.
- Scheduler wiring is now live in the default branch via GitHub Actions workflow `.github/workflows/reminder-cadence.yml`, with `PROCESS_NOTIFICATION_CADENCE_SECRET` configured both in Supabase function secrets and GitHub Actions secrets.
- Live scheduler-mode proof was captured on 2026-04-16 via GitHub Actions run `24538081808`, which invoked `process-notification-cadence` with `x-cron-secret` and returned `200 { success: true, dry_run: false, mode: "scheduler", processed: [...] }` with `processed_count=50`.
- The remaining reminder risk is no longer scheduler wiring. It is downstream delivery quality and provider acceptance, because the live scheduler run produced reminder attempts but many rows failed with `Resend failed (403)` or `Resend failed (422)`.

---

## 11) Release readiness / rollout operations
**Status:** Partial

### What exists
- CI workflow
- deploy workflow
- synthetic probes
- release/readiness docs and scripts
- private-beta readiness scripts

### What is still missing in practice
- Ongoing release evidence discipline for each meaningful promote
- Formal staged rollout execution and tracking
- Continued launch watch / post-deploy observation habits

---

## 12) Estimate backend workflow
**Status:** Built and live-verified

### What exists
- Backend workflow:
  - `supabase/functions/estimate-workflow/index.ts`
  - `supabase/config.toml`
- Frontend cutover:
  - `src/components/office/EstimatesTab.tsx`
- Coverage:
  - `src/test/estimate-workflow-edge.test.ts`
  - `src/test/estimates-frontend-cutover.test.ts`

### Live verification status
- Local tests and build passed on 2026-04-16.
- Function was deployed live to project `toitgmaeuscrdwbpntda` on 2026-04-16.
- Authenticated office Playwright smoke passed on 2026-04-16:
  - create path from `https://mr.rugboost.com/ops?tab=estimates` created `EST-MO1O135A`
  - revise path for rejected estimate `EST-MNY8GD0G` created `EST-MNY8GD0G-R2`

### Notes
- This is now a real backend-owned workflow in production, not just a contract or local implementation.

---

## 13) Handoff invoice backend workflow
**Status:** Built, deployed, and partially live-verified

### What exists
- Backend workflow:
  - `supabase/functions/generate-invoice-workflow/index.ts`
  - `supabase/config.toml`
- Frontend cutover:
  - `src/components/facility/InvoiceGeneratorPanel.tsx`
- Coverage:
  - `src/test/generate-invoice-workflow-edge.test.ts`
  - `src/test/invoice-generator-frontend-cutover.test.ts`

### Live verification status
- Local tests and build passed on 2026-04-16.
- Function was deployed live to project `toitgmaeuscrdwbpntda` on 2026-04-16.
- The live frontend bundle was confirmed after deploy to contain `generate-invoice-workflow`.
- Authenticated prod function smoke passed to the expected validation boundary on 2026-04-16, returning duplicate-invoice guardrail error `400 {"error":"One or more selected rugs already have invoice items"}` for a rug that had already been invoiced.
- A real office UI success-path invoice generation for rug `182081` created `INV-MO1OGL6R`, but that happened just before the frontend deploy finished, so it validated the business flow while still using the old browser-owned write path.

### Notes
- Backend cutover is live in production code, but the evidence is slightly uneven because the only available uninvoiced ready rug was consumed before the post-deploy UI success-path rerun.
- If a fresh uninvoiced ready rug becomes available, rerun one authenticated office UI smoke to close this evidence gap cleanly.

---

## 14) March 28 stabilization work
**Status:** Built and deployed on branch workflow

### Delivered
- Fixed broken company/billing backfill migrations
- Verified company billing backfill state on linked Supabase project
- Found and blocked future unlinked invoices
- Added authenticated and guard-based billing smoke coverage
- Found and fixed live schema drift for `clients.company_id` and `portal_users.company_id`
- Fixed follow-up trigger bug discovered during verification
- Verified client + portal user live temp insert/cleanup path
- Fixed smoke script auth payload bug that initially broke CI

### Relevant migrations/scripts
- `20260328043000_backfill_company_billing_status.sql`
- `20260328044000_backfill_job_company_ids.sql`
- `20260328045000_backfill_rug_company_ids.sql`
- `20260328045500_backfill_inspection_company_ids.sql`
- `20260328185000_prevent_unlinked_invoices.sql`
- `20260328211000_add_company_scope_to_clients_and_portal_users.sql`
- `20260328212000_fix_company_scope_insert_triggers.sql`
- `scripts/invoice-client-link-guard.sh`
- `scripts/invoice-authenticated-smoke.sh`
- `scripts/company-scope-column-smoke.sh`

### Current known-good branch state at time of writing
- Branch deploy and CI were green after commit `c841a7d`

---

## Recommended next priority order

1. Capture clean post-deploy UI success-path evidence for `generate-invoice-workflow` when a fresh uninvoiced ready rug is available
2. Verify scheduler wiring / real production execution for reminder cadence once a company-linked office/admin smoke account or scheduler-secret path is available
3. Capture fuller production smoke evidence for messaging/reminder flows
4. Tighten DB-native authority for remaining stop workflow invariants where valuable
5. Add durable idempotency persistence for repeated Check-In submissions / retries
6. Repair or backfill the 10 prod `rugs` rows that still have null `company_id`
7. Keep release evidence and rollout docs current as real deployments happen

---

## Maintenance note

This document should be updated whenever:
- a roadmap item materially changes status
- a production/schema drift is discovered
- a new subsystem is introduced
- a major bug fix changes the practical rollout sequence
- a previously planned item is found to already exist in code
