# Estimate Migration Strategy and Rollback Plan - 2026-04-24

## Purpose

This document defines the final backend-first migration strategy for the estimate workflow cutover after the touchpoint audit in `docs/estimate-cutover-audit-2026-04-24.md`.

It answers the next checklist item:
- final DB/status migration strategy
- queue ownership strategy
- portal visibility strategy
- rollback path

## Decision summary

## 1. Keep the current expanded estimate status enum
No destructive status migration is needed.

The current enum already matches the intended redesign closely enough:
- `draft`
- `needs_office_review`
- `ready_to_send`
- `sent`
- `approved`
- `rejected`
- `needs_revision`
- `expired`

The cutover should therefore be a **semantics-and-write-ownership migration**, not a risky status-enum rewrite.

## 2. Tighten status semantics into internal vs client-facing states

### Internal-only states
These should not be shown in the portal client history:
- `draft`
- `needs_office_review`
- `ready_to_send`
- `needs_revision`

### Client-facing states
These are the states the portal may expose:
- `sent`
- `approved`
- `rejected`
- `expired` **only when the estimate was previously client-visible**

Implementation note:
- unsent expired estimates are still internal office history, not client-facing history
- portal queries should therefore not be a raw `select * from estimates where client_id = ?`

## 3. Move lifecycle write ownership to the backend
The final model should remove business-critical estimate lifecycle writes from browser-direct table updates.

### Backend-owned writes after cutover
- create estimate
- revise estimate
- mark review group ready
- return revision back to office review
- expire estimate/group
- queue send batch
- optional manual override send
- portal approve/reject

### Browser role after cutover
- send intent only
- never own direct lifecycle writes for estimate status or outbound scheduling

This preserves auditability and reduces drift between row actions and group actions.

## 4. Make backend the sole owner of send scheduling
All `estimate_batch_send` cadence creation should be backend-owned.

### Final rule
Only explicit office queue actions should create or refresh `estimate_batch_send` rows.

### Remove / stop using
- Check In automatic queueing
- browser-direct `notification_cadence` upserts for estimate sends

### Keep
- `process-notification-cadence` as the authoritative grouped sender
- `estimate_send_batches` and `estimate_send_batch_items` as the grouped send record

## 5. Keep grouped end-of-day sending as the default send mechanism
The canonical outbound flow remains:
1. estimate is reviewed
2. estimate becomes `ready_to_send`
3. office explicitly queues the client/group
4. backend schedules `estimate_batch_send`
5. `process-notification-cadence` sends one grouped client batch
6. estimates become `sent`
7. reminders are seeded

## 6. Treat `send-estimate-email` as legacy compatibility, not the primary path
`supabase/functions/send-estimate-email/index.ts` should not remain the normal office send flow.

Recommended final classification:
- keep temporarily for compatibility / emergency manual use during transition
- do not wire it into the rebuilt primary Estimates workflow
- remove only after the grouped batch path is stable in production

This gives rollback safety without preserving the wrong default product model.

## Required backend changes before the office UI rebuild

## A. Remove Check In pre-queueing
Current problem:
- Check In creates `estimate_batch_send` cadence rows before office review

Required change:
- stop writing `estimate_batch_send` rows from `check-in-workflow`

Why this is required first:
- it violates the intended operating model
- it creates latent immediate-send risk if a stale due cadence row exists and the estimate later becomes `ready_to_send`

## B. Clean up stale pre-queued cadence rows
Current problem:
- already-created rows may still exist for estimates that were never explicitly queued by office

Required cleanup rule:
- remove or neutralize unsent `notification_cadence` rows for `estimate_batch_send` when the estimate is not intentionally queued by office

Recommended safe approach:
- one additive cleanup migration or admin-safe cleanup script that deletes unsent `estimate_batch_send` rows for estimates whose status is not `ready_to_send`
- if more conservative, delete only rows proven to originate from Check In pre-queueing and then let office re-queue explicitly

## C. Consolidate status transitions behind backend functions
Required change:
- add or extend backend transition RPCs/functions so single-row and grouped row actions share the same status validation, logging, and side effects

Preferred direction:
- grouped and single-estimate actions should both route through one backend-owned transition layer
- the current group RPC pattern is the better foundation than browser-direct writes

## D. Centralize queue creation behind backend functions
Required change:
- queue creation should happen through one backend entry point

Acceptable final shapes:
- expand `queue_estimate_group_batch()` to support single-estimate queueing via ids
- or add a dedicated backend single-estimate queue function that shares the same implementation

What should disappear from the primary flow:
- browser-direct estimate send scheduling writes

## E. Move portal estimate reads to a client-facing filter or dedicated read model
Required change:
- portal estimate history should only read client-facing rows

Preferred direction:
- a dedicated portal-safe RPC/view/read helper is better than an inline raw table filter in the component

Why:
- it keeps internal-state hiding enforceable in one place
- it reduces the chance of future accidental leakage of internal workflow states

## Final target state by subsystem

## Check In
- may create draft/internal estimate work
- must not queue sends
- must leave clean office handoff context

## Office Estimates
- grouped review queue remains primary
- all lifecycle writes go through backend transition functions
- explicit queue action is required before grouped send

## Scheduler / send engine
- `process-notification-cadence` remains canonical
- grouped batch send remains canonical
- sends only explicitly queued work

## Portal
- sees only client-facing estimate states
- keeps current approve/reject event compatibility
- does not expose internal review/pre-send history

## Reporting / reminders / ops views
No compatibility break should be introduced for:
- `estimate_approved_by_client`
- `estimate_rejected_by_client`
- `estimate_sent`
- `estimate_send_failed`

Those event types are already consumed elsewhere and should remain stable.

## Data migration strategy

## What does NOT need migration
- no status-enum rewrite
- no destructive schema drop
- no rug/estimate/invoice relationship rewiring
- no estimate id regeneration
- no client-visible record deletion

## What DOES need migration / cleanup
- cleanup of stale `estimate_batch_send` cadence rows created before explicit office queueing became the rule
- optional additive RPCs/functions for unified lifecycle transitions and queue writes
- optional portal-safe read model for client-facing estimate history

## Rollout order

### Step 1. Backend cleanup and compatibility layer
Ship first:
- remove Check In auto-queueing
- add centralized transition/queue functions
- add portal-safe estimate read path
- keep legacy function available but off the main path

### Step 2. Office UI cutover
Then switch office UI to:
- backend-owned transition actions
- backend-owned queue actions only
- grouped review-first surface

### Step 3. Portal cutover
Then switch portal to:
- client-facing estimate read model only
- unchanged approve/reject outcome events

### Step 4. Stability window
Observe:
- send batches created only from explicit office queueing
- no accidental immediate sends from stale cadence rows
- portal no longer exposes internal estimate lifecycle states
- downstream reminder/ops views still interpret response events correctly

### Step 5. Legacy cleanup
Only after stability:
- decide whether `send-estimate-email` can be deleted or should remain as an admin-only override

## Rollback path

## Rollback principle
Because this cutover is additive-first, rollback should prefer reverting callers and cleanup behavior, not reverting data structures.

## Safe rollback options

### If the rebuilt office UI regresses
- revert the office UI to the prior screen
- keep additive backend RPCs in place
- data remains compatible because status enum and core tables are unchanged

### If centralized queueing regresses
- temporarily restore the prior office queue caller while keeping Check In auto-queue disabled
- do **not** restore automatic Check In queueing as the first rollback step

### If portal filtering regresses
- revert the portal component/query change
- underlying estimate/status data remains intact

### If grouped send path regresses badly
- use the legacy `send-estimate-email` path as an emergency/manual compatibility escape hatch while fixing the grouped flow
- do not reclassify it as the normal default product model

## Rollback guardrails
- no destructive deletion of estimate records
- no destructive deletion of estimate_items
- do not mutate estimate ids or client/rug relationships
- keep communication event types stable during rollout
- keep old code paths available until the new flow is verified live

## Verification requirements for the cutover implementation

Before calling the implementation slice done, verify:
1. Check In-created estimates no longer schedule send cadence automatically
2. only explicit office queue actions create/refresh `estimate_batch_send`
3. stale pre-queued cadence rows are neutralized
4. office row and group actions hit the same backend transition rules
5. portal no longer shows internal-only statuses
6. grouped send still produces `estimate_send_batches`, `estimate_send_batch_items`, and `estimate_sent` events
7. portal approve/reject still emits `estimate_approved_by_client` / `estimate_rejected_by_client`
8. downstream reminders/ops views still render client responses correctly

## Checklist impact

This strategy is sufficient to complete the checklist item:
- `Define final DB/status migration strategy and rollback path`

The next implementation work should now move to the actual backend cleanup slice:
- remove Check In auto-queueing
- centralize lifecycle/queue writes
- then rebuild the office surface on top of that backend truth
