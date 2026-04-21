# Estimate Batch Send Consolidation Slice 01 - 2026-04-21

## Goal

Move estimate communication from a queue-time grouping approximation toward a true backend-owned client batch model.

## Problem confirmed

As of this slice, Office grouped review and grouped queueing are backend-shaped, but the delivery processor still treats each `estimate_batch_send` cadence row as an isolated estimate email.

That means:

- one client/account can still receive multiple estimate emails in a run
- communication logging is still primarily per-estimate
- there is no batch-level communication linkage in the active send path

## Additive slice 01

Add the minimum durable backend structures needed for true grouped sending without rewriting the entire send processor in one jump.

### Added structures

- `estimate_send_batches`
  - one logical outbound estimate batch per client/account send unit
- `estimate_send_batch_items`
  - links included estimates to that batch
- `communication_events.estimate_batch_id`
  - allows communication logs to attach to a batch as well as individual estimates

## Why this slice is intentionally narrow

The existing scheduler path in `supabase/functions/process-notification-cadence/index.ts` still has a lot of stable behavior around:

- manual vs scheduler auth handling
- company scoping
- provider result logging
- reminder seeding
- throttle handling

Rewriting all of that at once would be riskier than necessary.

So the correct professional sequence is:

1. persist batch identity
2. persist estimate membership inside the batch
3. add batch-level communication linkage
4. then cut the scheduler over from estimate-row sends to batch-owned sends

## Expected next slice

The next implementation slice should:

- resolve pending `estimate_batch_send` rows into batch records
- send one outbound communication per batch/client instead of one per estimate
- mark included estimates sent together
- seed reminder cadence per included estimate after successful batch delivery
- log one batch communication event plus estimate-linked traceability

## Current truth after slice 01

- grouped estimate queueing now creates batch linkage data
- the database can represent a client/account estimate send unit
- the scheduler has not yet been fully cut over to use batch-owned sending as its primary execution model
