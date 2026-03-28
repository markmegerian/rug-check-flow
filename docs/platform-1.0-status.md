# Platform 1.0 Status Tracker

_Last updated: 2026-03-28_

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
- `clients.company_id` and `portal_users.company_id` rollout + type sync + CI smoke

### Still incomplete / ongoing
- Company scoping on remaining legacy workflow/accounting tables
- Messaging threads / Office Inbox
- Reminder cadence automation for estimates and invoices
- Stronger “pure DB” enforcement for some stop workflow invariants if desired
- Release evidence / rollout discipline beyond branch deploy health

---

## Workstream review

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

### Remaining likely work
The following areas still need a proper review/rollout for company scoping consistency:
- `rugs`
- `invoices`
- `payments`
- `approved_estimates`
- `client_service_selections`
- `service_completions`

### Notes
- This is currently the clearest structural gap left after the March 28 stabilization work.
- Treat this as a separate epic, not an incidental cleanup.
- Detailed rollout plan now lives in `docs/company-scope-rollout-plan.md`.
- Repeatable audit script: `scripts/company-scope-audit.sh`.
- New blocker discovered during audit: prod currently has 0 `companies` rows, 0 `company_memberships` rows, and `clients.company_id` is null on all 901 clients, so downstream company backfills are blocked until upstream company ownership is seeded/assigned.

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
**Status:** Not built

### What exists
- Generic `interactions` table
- `communication_events` table

### What is missing
- Explicit thread convention implemented end-to-end:
  - `thread_general`
  - `thread_estimate:<id>`
  - `thread_invoice:<id>`
- Office Inbox UI grouped by client/thread
- Clear portal-side thread composition flow

### Notes
- This is still a real roadmap item, not merely a cleanup task.

---

## 10) Reminder cadence automation
**Status:** Partial

### What exists
- Operational alerts function:
  - `supabase/functions/operational-alerts/index.ts`
- Dashboard reminders panel:
  - `src/components/dashboard/OperationalRemindersPanel.tsx`
- Synthetic probe workflow:
  - `.github/workflows/synthetic-probes.yml`

### What is still missing
- Full estimate reminder cadence automation
- Full invoice reminder cadence automation
- Thread-aware reminder dispatch model described in roadmap docs
- Per-client throttled collections cadence implementation as specified

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

## 12) March 28 stabilization work
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

1. Bootstrap upstream company ownership (`companies`, `company_memberships`, and real `clients.company_id` assignment)
2. Finish company scoping on remaining legacy tables
3. Build Office Inbox / thread model
4. Implement full reminder cadence automation
5. Tighten DB-native authority for remaining stop workflow invariants where valuable
6. Keep release evidence and rollout docs current as real deployments happen

---

## Maintenance note

This document should be updated whenever:
- a roadmap item materially changes status
- a production/schema drift is discovered
- a new subsystem is introduced
- a major bug fix changes the practical rollout sequence
- a previously planned item is found to already exist in code
