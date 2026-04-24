# Estimate Cutover Audit - 2026-04-24

## Purpose

This audit inventories the current estimate creation, review, queueing, send, and client-response touchpoints so the remaining estimate-workflow checklist items can cut over cleanly.

It is specifically aimed at the redesign goal already defined in `docs/estimate-workflow-redesign-2026-04-20.md`:
- office-controlled review
- grouped client/company work units
- end-of-day grouped sending
- portal visibility only after explicit office send

## Reviewed implementation touchpoints

### Backend / database
- `supabase/functions/check-in-workflow/index.ts`
- `supabase/functions/estimate-workflow/index.ts`
- `supabase/functions/process-notification-cadence/index.ts`
- `supabase/functions/send-estimate-email/index.ts`
- `supabase/migrations/20260421053000_add_estimate_group_action_functions.sql`
- `supabase/migrations/20260421054500_simplify_estimate_review_groups_function.sql`
- `supabase/migrations/20260421060000_add_estimate_group_details_function.sql`
- `supabase/migrations/20260421061500_add_queue_estimate_group_batch_function.sql`
- `supabase/migrations/20260421070000_add_estimate_send_batch_summary_function.sql`
- `supabase/migrations/20260421073000_add_estimate_send_batch_action_functions.sql`

### Frontend / client flows
- `src/components/office/EstimatesTab.tsx`
- `src/components/portal/PortalEstimatesTab.tsx`
- `src/lib/estimate-group-actions.ts`
- `src/lib/estimate-group-details.ts`
- `src/lib/estimate-send-batches.ts`
- `src/lib/notification-cadence.ts`
- `src/lib/notification-cadence-store.ts`
- `src/lib/workflow-guards.ts`
- `src/lib/message-threads.ts`
- `src/lib/thread-copy.ts`
- `src/lib/jobs-view.ts`
- `src/hooks/useOperationalReminders.ts`
- `src/hooks/useSuperAdminQueues.ts`

## Current lifecycle inventory

## 1. Estimate creation entry points

### A. Check In auto-draft path
`check-in-workflow` creates rug-level estimates when non-cleaning estimate-required services are present.

Current behavior:
- creates `estimates` row with status `needs_office_review`
- creates `estimate_items`
- logs `estimate_auto_drafted_from_checkin`
- **also queues `notification_cadence` with `estimate_batch_send` immediately after check-in**

Why this matters:
- the status is correctly internal (`needs_office_review`)
- but the cadence row is created before office review is complete
- `process-notification-cadence` later skips the send until status becomes `ready_to_send`, so this is not immediately sending bad mail
- however it creates premature outbound queue state that conflicts with the redesign’s “office explicitly decides send readiness” rule
- it also creates a latent send-risk: once office later flips the estimate to `ready_to_send`, an already-due cadence row can be picked up immediately even if office never explicitly queued that group for the batch

### B. Office manual create / revise path
`estimate-workflow` is the office/admin edge function for:
- `mode: create`
- `mode: revise`

Current behavior:
- create: snapshots current `rug_services` into a new estimate
- revise: duplicates rejected estimate items into a new version
- both land in `needs_office_review`
- logs `estimate_created` or `estimate_revised`

This path matches the redesign direction more closely than Check In because it does not auto-send.

## 2. Office review / status transition touchpoints

### A. Grouped read model
The main office grouping model is backend-owned via:
- `get_estimate_review_groups()`
- `get_estimate_group_details(client_id, status)`

Current grouping facts:
- grouped by `client_id`
- grouped separately per `status`
- summary counts include `review_count`, `ready_count`, `sent_count`
- no dedicated persisted review-batch table yet

This is a good additive read-model base for the cutover.

### B. Group actions
Group-level actions currently use RPCs:
- `mark_estimate_group_ready()`
- `expire_estimate_group()`
- `queue_estimate_group_batch()`

Current effects:
- ready action flips `needs_office_review -> ready_to_send`
- expire action can expire `needs_office_review | ready_to_send | sent | needs_revision`
- queue action writes `notification_cadence` rows for `estimate_batch_send`
- ready/expire RPCs also create `communication_events`

### C. Direct row actions in the office UI
`EstimatesTab` still has a second transition path that updates `estimates` directly from the browser for single-estimate actions.

Current direct row actions include:
- `needs_office_review -> ready_to_send`
- `ready_to_send -> queue for 3 PM ET`
- `sent -> approved`
- `sent -> rejected`
- `needs_revision -> needs_office_review`
- active statuses -> expired

Current consequence:
- the same business transitions are split between RPC-backed group actions and direct table updates
- this duplicates transition logic and audit behavior
- some transitions log through `communication_events` in JS, others log in SQL RPCs

## 3. Queueing and outbound send touchpoints

### A. Browser queueing path
The browser can queue a send in two ways:
- `queueEstimateForBatchSend()` from `src/lib/notification-cadence-store.ts`
- `queueEstimateGroupBatch()` RPC

Both ultimately create `notification_cadence` rows with:
- `entity_type = estimate`
- `notification_type = estimate_batch_send`
- `scheduled_for = next 3:00 PM ET anchor`

### B. Scheduler / delivery path
`process-notification-cadence` is the real sender for the grouped model.

Current behavior:
- loads due `notification_cadence` rows
- for `estimate_batch_send`, requires estimate status `ready_to_send`
- calls `ensure_estimate_send_batch(...)`
- groups items into `estimate_send_batches` + `estimate_send_batch_items`
- sends one grouped email per batch
- marks included estimates `sent`
- seeds reminder cadence rows
- logs `estimate_sent` or `estimate_send_failed`

This is the authoritative batch-send path today.

### C. Legacy single-estimate send function
`supabase/functions/send-estimate-email/index.ts` still exists.

Current behavior:
- sends a single estimate email
- accepts `ready_to_send` or already `sent`
- updates a single estimate to `sent` if needed
- logs `estimate_sent` or `estimate_resent`

Current audit judgment:
- this is a legacy/non-primary send path
- it is not the grouped batch model
- it is not referenced by the current office Estimates surface
- it should either become an explicit override path or be retired during cutover

## 4. Portal/client response dependencies

### A. Portal visibility rules are not yet aligned with the target model
`PortalEstimatesTab` currently loads **all** estimates for the client and splits them into:
- pending = `status === sent`
- history = everything else

That means portal history currently includes internal states such as:
- `draft`
- `needs_office_review`
- `ready_to_send`
- `needs_revision`
- `expired`

This directly conflicts with the redesign rule that clients should only see estimates after explicit office send.

### B. Portal approval flow
For `sent` estimates, the portal currently:
- loads `estimate_items`
- allows client approve/reject on non-cleaning line items
- mirrors line-item decisions onto `rug_services.approval_status` when available
- updates the estimate itself to `approved` or `rejected`
- writes `communication_events` as `estimate_approved_by_client` or `estimate_rejected_by_client`

### C. Downstream dependencies on those response events
These event types are already consumed by:
- `src/lib/jobs-view.ts`
- `src/hooks/useOperationalReminders.ts`
- `src/hooks/useSuperAdminQueues.ts`

Cutover implication:
- the redesign can change how sends are queued and what the portal shows
- but it should preserve these client-response event types or provide a compatibility layer

## 5. Messaging/thread dependencies

Estimate threads are already first-class via:
- `thread_type = estimate`
- office deep-linking from Estimates to `/portal/messages?threadId=...`
- entity label resolution from `estimate_number`

Cutover implication:
- estimate attention/management UI can be reorganized safely
- but estimate thread routing should remain stable unless thread ownership is redesigned intentionally

## Current mismatches and risks to resolve before broader UI rebuild

## Mismatch 1. Check In still pre-queues outbound cadence
This is the clearest backend mismatch with the redesign.

Desired rule:
- Check In creates internal estimate work only

Current rule in code:
- Check In creates internal work **and** pre-queues the outbound cadence row

Recommended cutover action:
- remove automatic `estimate_batch_send` queueing from Check In
- queue only after office explicitly marks work ready / queues the group
- clean up or ignore any already-created stale cadence rows so old pre-queued records cannot auto-fire after the cutover

## Mismatch 2. Two separate office transition systems exist
Current transition logic is split across:
- SQL RPC group actions
- browser-direct `estimates` updates

Risk:
- business rules, audit logging, and side effects can drift

Recommended cutover action:
- move estimate lifecycle writes behind one backend-owned transition layer
- keep the grouped RPC model as the likely base

## Mismatch 3. Portal still exposes internal lifecycle states in history
Current portal history shows unsent/internal statuses.

Recommended cutover action:
- restrict portal visibility to client-facing states only
- likely `sent | approved | rejected | expired` at most
- explicitly decide whether `needs_revision` should ever be client-visible

## Mismatch 4. Queue ownership is mixed between browser and backend
Current queue creation can happen in:
- browser JS upserts
- SQL RPC
- Check In backend side effect

Recommended cutover action:
- make backend the only queue owner for estimate send scheduling
- keep browser as an intent sender, not the scheduler writer

## Mismatch 5. Legacy single-estimate sender remains live in code
The legacy single-send function is not aligned with grouped end-of-day sending.

Recommended cutover action:
- classify it explicitly as either:
  - emergency/manual override only, or
  - deprecated and removable after cutover

## Recommended next implementation order

1. **Define final DB/status migration and rollback path**
   - confirm client-visible vs internal-only statuses
   - define whether direct status writes are being removed
   - define legacy send-function disposition

2. **Backend cleanup before UI rebuild**
   - remove Check In auto-queueing
   - centralize lifecycle transitions behind backend-owned functions
   - centralize send-queue creation behind backend-owned functions

3. **Office Estimates rebuild**
   - keep grouped review first
   - separate attention vs management more clearly

4. **Portal cutover**
   - hide internal states
   - preserve approve/reject + event logging compatibility

## Checklist impact

This audit is sufficient to complete the checklist item:
- `Inventory current estimate send/review touchpoints and portal dependencies for implementation cutover`

It also identifies the concrete backend-first prerequisite for the next item:
- define the final DB/status migration strategy around queue ownership, transition ownership, portal visibility, and the legacy single-send path.
