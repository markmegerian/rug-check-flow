# Estimate Workflow Redesign - 2026-04-20

## Why this redesign exists

The current estimate workflow is too estimate-by-estimate and too automation-forward for the operating model the business actually wants.

The intended future state is:

- Check In can create estimate drafts when needed
- Office reviews estimate-worthy rugs in a clean, grouped workflow
- Review is grouped by client/company so staff can process all items for one account together
- Client-facing estimate communication is sent in one end-of-day batch per client/company, not as multiple scattered sends throughout the day
- The client should only see estimates after explicit office review and send

The user explicitly approved a deeper model rewrite instead of a temporary compatibility layer because estimates are not currently a live operational dependency.

## Problems with the current model

Current behavior and architecture still imply a narrower, rug-by-rug estimate flow:

- current estimate statuses are limited to `draft`, `sent`, `approved`, `rejected`, `expired`
- `EstimatesTab` is primarily estimate-record centric rather than office-review centric
- the current UI allows queueing one estimate at a time
- the current guard model is built around direct status transitions, not an office review lifecycle
- grouped company/client review is not a first-class concept
- end-of-day grouped sending is not the organizing principle of the office workflow yet

This leads to several business problems:

- office staff are forced to process estimate work one rug at a time instead of one client/company at a time
- clients risk receiving multiple estimate emails in one day for the same account
- estimate review context from Check In can become fragmented or buried
- the workflow mixes internal preparation state with client-visible state too early

## Core operating rules

These are now design requirements, not optional nice-to-haves.

### 1. Check In creates internal estimate work, not client communication

When Check In encounters estimate-required work, it should:

- create or update rug-level estimate records
- store a clear internal handoff summary for office
- never auto-send the estimate to the client

### 2. Office review is grouped by client/company

Office should not review one estimate in isolation unless they choose to drill in.

The default operational surface should group pending estimate work by client/company and show all related rugs together.

Example mental model:

- Peykar
  - 4 rugs needing estimate review
  - 2 ready to send
  - 1 needs revision

### 3. Sending is batched at end of day

Estimate communication should be batched per client/company so the client receives one clean grouped email rather than multiple scattered notifications.

### 4. Individual estimates still exist at rug level

We should keep estimate records at rug level because pricing, services, approvals, and production links are still rug-specific.

The key architecture rule is:

- record integrity remains rug-level
- operational review and outbound communication become client/company-level

## Proposed target model

## Status model

Replace the current simplified estimate lifecycle with a more explicit office-controlled model.

Recommended target statuses:

- `draft`
  - estimate exists but is incomplete or still being assembled
- `needs_office_review`
  - created from Check In or another source and requires office review before it can be sent
- `ready_to_send`
  - office has reviewed it and it is eligible for inclusion in the next client batch
- `sent`
  - included in a client-facing batch communication
- `approved`
  - client approved
- `rejected`
  - client rejected
- `needs_revision`
  - office or client feedback requires edits before it can be sent again
- `expired`
  - optional terminal state for stale estimates

### Status semantics

The critical distinction is:

- `needs_office_review` and `ready_to_send` are internal states
- `sent`, `approved`, and `rejected` are client-facing lifecycle states

That separation should be enforced in both backend logic and UI.

## Review grouping model

### Rug-level estimate records

Each rug can still have:

- estimate id
- estimate number
- version
- total
- line items
- notes
- photos/attachments relationships
- status

### Client/company review batch

The office-facing workflow should group estimate work by client/company.

Each grouped batch should expose:

- client/company id
- client/company name
- batch date bucket, likely based on local operational day
- all rugs with open estimate-review work
- counts by status
- total count ready to send
- whether the batch is blocked by missing pricing/info
- whether a send already happened for that client today

This can be implemented initially as a derived read model before introducing a dedicated persisted batch table.

## Office queue design

The office estimates surface should shift from a flat estimate list into a grouped review queue.

### Primary queue sections

- Needs Review
- Ready to Send
- Awaiting Client
- Needs Revision
- Closed

### Default unit of review

Each queue row should be a client/company group, not a single estimate row.

### Group card contents

Each group card should show:

- client/company name
- number of rugs in the group
- rug tags/numbers summary
- count of items in `needs_office_review`
- count of items in `ready_to_send`
- count of items in `needs_revision`
- whether anything has already been sent today
- most recent office/client communication timestamp
- batch total if calculable
- one primary action

### Drill-in view

Opening a group should show all related rugs and estimates together with:

- rug number/tag
- requested services
- estimate reason
- check-in intake summary
- photos count and preview access
- condition notes
- current line items
- current total
- estimate status
- edit / mark ready / request revision actions

## Check In handoff requirements

When Check In creates estimate-worthy work, it must leave clean office context.

Each estimate handoff should capture:

- client/company
- rug id and rug number
- who checked it in
- check-in timestamp
- selected/requested services
- why an estimate is needed
- dimensions
- condition notes
- photos count and references
- current draft total if one exists
- any missing information that blocks review

This handoff summary should be visible from the office review surface without requiring staff to infer meaning from raw records.

## Outbound communication model

## Batch send rule

The system should send one grouped estimate communication per client/company per operational day.

That means:

- multiple rugs can be reviewed independently during the day
- multiple rug estimates can become `ready_to_send`
- the outbound client send should consolidate them into one batch

### Batch contents

One outbound batch should include:

- client greeting/context
- summary of all included rugs
- each rug's estimate details
- totals per rug
- approval/rejection instructions or links

### Send timing

Preferred operating model:

- office marks estimates `ready_to_send`
- end-of-day batch process sends grouped communications
- if office needs an exceptional same-day send, that should be an explicit override path, not the default

### Communication logging

We should log:

- one batch-level outbound communication event
- included estimate ids
- included rug ids
- recipient
- send timestamp
- delivery state

Per-estimate communication traceability should still be preserved by linking each included estimate to that batch event.

## Recommended data-model direction

Because this is a deeper rewrite, we should not force everything into today’s minimal estimate schema if it becomes awkward.

Recommended additive path:

### Keep / evolve rug-level estimates

Continue using `estimates` as the rug-level source of truth.

### Add review/batch support

Introduce additive structures as needed, potentially:

- `estimate_review_groups` or `estimate_batches`
- `estimate_batch_items`
- or an RPC/view-backed grouped read model first, followed by persisted tables only if operationally necessary

### Suggested minimum additive fields if helpful

Possible additive fields on `estimates`:

- `review_status` if we decide not to overload `status`
- `review_group_key` or client/day grouping helper
- `ready_to_send_at`
- `reviewed_by`
- `reviewed_at`
- `sent_batch_id`

However, if we are committing to Option B fully, it may be cleaner to replace the current estimate `status` lifecycle directly rather than split status into multiple overlapping concepts.

## Recommended implementation choice

Because the user approved a deeper rewrite and current estimate usage is low-risk, the recommended implementation is:

- rewrite the estimate lifecycle directly
- update guards and UI to the new status model
- use additive migration discipline to preserve safety and rollback paths

## Affected code areas identified so far

### Frontend

- `src/components/office/EstimatesTab.tsx`
- `src/components/portal/PortalEstimatesTab.tsx`
- `src/components/shared/StatusBadge.tsx`
- `src/lib/workflow-guards.ts`
- `src/integrations/supabase/extended.ts`
- any office queue or navigation surfaces that link into estimates

### Backend / workflow

- `supabase/functions/estimate-workflow/index.ts`
- any check-in workflow code that triggers estimate creation
- communication event logging around estimate sends and responses
- daily batch send logic currently associated with `queueEstimateForBatchSend(...)`

### Read-model / query layer

- likely new RPC/view/query path for grouped estimate review by client/company
- likely new grouped batch send loader and mutation path

## Transition rules to define in implementation

These are the core transitions to codify:

- `draft` -> `needs_office_review`
- `needs_office_review` -> `ready_to_send`
- `needs_office_review` -> `needs_revision`
- `needs_revision` -> `needs_office_review`
- `ready_to_send` -> `sent`
- `sent` -> `approved`
- `sent` -> `rejected`
- `rejected` -> `needs_revision`
- `sent` -> `expired`

We should also decide whether office can send directly from `needs_office_review` in emergencies. Recommendation: no, require explicit `ready_to_send` first for operational clarity.

## UX principles

The redesigned flow should follow these rules:

- office should always know the next action
- grouped company/client review should be the default, not a filter afterthought
- one account should not receive multiple estimate emails in one day by default
- internal review state must be visually distinct from sent/client-visible state
- staff should not need to infer context from raw status badges alone
- the same estimate work should not appear like disconnected records across multiple surfaces

## Migration and rollout strategy

Even though the business risk is currently lower, implementation should still follow additive safety discipline.

### Phase 1. Design + inventory

- inventory all estimate touchpoints
- confirm exact current send path and any live cron/batch behavior
- confirm portal/client approval path dependencies on current statuses

### Phase 2. Status/model migration

- add new statuses and schema changes required
- update TypeScript bindings and guards
- preserve backwards readability for legacy rows during cutover

### Phase 3. Grouped office review read model

- add grouped client/company review query path
- build new office estimates queue around grouped review

### Phase 4. Batch send rewrite

- replace one-estimate queue assumptions with grouped client/company batch sending
- log batch sends cleanly

### Phase 5. Portal/client compatibility

- ensure portal view only exposes truly client-visible states
- ensure client response actions map cleanly into the new lifecycle

### Phase 6. Verification

- build/tests
- workflow tests for lifecycle transitions
- grouped review tests
- batch send tests
- live dry-run verification before enabling actual send behavior

## Open decisions to resolve during implementation

- whether `status` alone should carry both internal and external lifecycle, or whether a second review-state field is cleaner
- whether grouped client/company review should be derived entirely from `estimates` + `clients`, or whether a persisted batch table is worth introducing immediately
- what constitutes a company grouping key when clients share billing contacts or umbrella accounts
- how end-of-day batch timing should be configured and overridden
- whether one grouped email should contain multiple estimates inline or a summary with linked estimate pages
- whether mixed statuses within the same client group should block sending the ready subset or allow partial grouped sends

## Recommendation

Proceed with the full workflow rewrite, but do it in this order:

1. define new estimate lifecycle and guards
2. define grouped office review read model by client/company
3. rebuild office estimates UI around grouped review
4. rewrite batch sending around grouped company/client sends
5. validate portal/client visibility after internal review/send semantics are clean

This is the cleanest path to a professional estimate workflow that matches actual office operations.
