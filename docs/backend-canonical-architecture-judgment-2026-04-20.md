# Backend Canonical Architecture Judgment - 2026-04-20

## Purpose

This document closes the current backend mapping pass by stating, clearly, what the backend appears to be, what its canonical future should be, and what structures are legacy/parallel contamination.

This is the judgment layer on top of the raw mapping work.

## Executive judgment

The backend is a **hybrid of at least two architectural generations**.

### Generation 1, older
Inspection/job-centric, portal-access/token-centric, and often blob-oriented.
Examples:
- `approved_estimates`
- `declined_services`
- `price_overrides`
- `client_job_access`
- `client_service_selections`
- `inspections.system_services`
- inspection/job-linked estimate state

### Generation 2, newer
Rug/client/itemized/workflow-oriented and more operationally direct.
Examples:
- `rugs`
- `rug_services`
- `estimate_items`
- newer estimate workflow assumptions
- `invoice_items`
- `message_threads` / `messages`
- delivery snapshot and summary RPCs
- pickup/delivery/route execution structures

The platform mud comes from the fact that **Generation 2 was layered on top of Generation 1 without fully retiring, isolating, or canonizing the older structures**.

## Canonical backbone, as it should be

If this backend were being defined cleanly now, the canonical backbone should be:

### Tenancy / identity
- `companies`
- `company_memberships`
- internal staff roles
- portal/client identity model

### Client and operational entity layer
- `clients`
- `rugs`
- `pickup_requests`
- `pickup_request_items`
- `delivery_lists`
- `delivery_list_items`
- `route_stops`
- `route_stop_items`

### Service and pricing layer
- one canonical service definition table
- one canonical company pricing table keyed by service id
- one rug-level service snapshot table (`rug_services` direction is right)

### Estimate layer
- one estimate header model
- one estimate item table
- one approval lifecycle
- no JSON/blob estimate payloads as primary truth

### Invoice and finance layer
- one invoice header model
- one invoice item table
- one payment model
- one allocation model
- one credit memo model
- explicit derived versus source-of-truth money fields

### Communication layer
- one threaded messaging model
- one clearly bounded business-event log model
- one notification scheduling/throttling model

## What should be considered canonical now

### Canonical enough to preserve
These structures look like the right direction even if some cleanup remains:

- `clients`
- `companies`
- `company_memberships`
- `portal_users` as a concept
- `rugs`
- `rug_services`
- `pickup_requests`
- `pickup_request_items`
- `delivery_lists`
- `delivery_list_items`
- `route_stops`
- `route_stop_items`
- `message_threads`
- `messages`
- `invoice_items`
- `estimate_items`
- `payment_attempts`
- `payment_allocations`

### Canonical with caution
These are probably part of the right future, but currently need structural clarification:

- `invoices`
- `payments`
- `notification_cadence`
- `communication_events`
- `jobs`

## What should be treated as legacy/parallel contamination until proven otherwise

These are not necessarily dead today, but they should no longer be treated as unquestioned canonical truth:

- `approved_estimates`
- inspection-centric estimate records
- `declined_services`
- `price_overrides`
- `client_job_access`
- `client_service_selections`
- `inspections.system_services`
- `rugs.services` string array as primary service truth
- `invoice_payments` if `payments` + `payment_allocations` is the actual finance direction
- `interactions` if `communication_events` and threaded messaging have superseded it

## Domain-by-domain canonical judgment

## 1. Clients / tenancy
**Judgment:** keep and clarify

The model is mostly sane. The main need is clearer company/auth ownership boundaries.

## 2. Rugs / intake
**Judgment:** keep, but retire duplicate service representation

`rugs` should remain core.
`rugs.services` should not remain a competing truth source if `rug_services` is canonical.

## 3. Jobs
**Judgment:** keep only if job is redefined clearly as an operational aggregate, not a legacy estimate container

`jobs` currently looks like an aggregate/operational shell spanning client communication, approvals, and payments.
That can be valid, but only if its relationship to rugs, inspections, and estimates is explicitly redefined.

## 4. Services / pricing
**Judgment:** re-canonize

This is one of the most important backend repairs.
The current split across enabled services, service prices, overrides, declined services, and rug snapshots is too muddy.

## 5. Estimates
**Judgment:** rebuild around the newer normalized itemized model

The old inspection/job/blob estimate structures should be treated as legacy unless there is a hard operational reason they still must exist.
A canonical future estimate should be:
- client-linked
- rug-linked where applicable
- itemized
- versioned
- office-reviewed
- explicitly sent
- explicitly approved/rejected/revised

## 6. Invoices / payments
**Judgment:** repair and re-canonize

The invoice header/item direction is right.
The payment direction likely needs consolidation:
- decide whether `payments` + `payment_allocations` is the canonical model
- deprecate `invoice_payments` if it is now redundant
- define exact ownership of invoice totals/balances

## 7. Messaging / communication
**Judgment:** keep threads, clarify event logs, likely retire duplicates

Threaded conversation should remain.
Business event logging should remain only if it has a narrow explicit role.
Other overlapping communication tables should be treated skeptically.

## 8. Logistics / route execution
**Judgment:** keep

This is the cleanest and most trustworthy backend area currently visible.

## Structural contradictions that must be resolved

### A. Estimate contradiction
- `approved_estimates` / inspection/job/blob model
- newer estimate/itemized model

These cannot both remain conceptually primary.

### B. Service contradiction
- company enabled service names
- company service prices by name
- rug service snapshots by id/name
- inspection-era declined/override structures

One canonical service/pricing backbone must be chosen.

### C. Payment contradiction
- `invoice_payments`
- `payments`
- `payment_allocations`

One canonical payment model must be chosen.

### D. Communication contradiction
- `interactions`
- `communication_events`
- `message_threads`
- `messages`

One conversation model and one event-log model is enough. More than that is drift.

## The right cleanup philosophy

Do not drop everything blindly.

The proper approach is:

1. declare the canonical model per domain
2. redirect active workflows to it
3. isolate legacy structures
4. migrate data where necessary
5. remove or archive obsolete structures only after verification

## Final conclusion

The backend is **not irredeemable**, but it is absolutely **not canonically structured yet**.

The correct interpretation is:
- a real operational backbone exists
- newer normalized patterns are emerging and often look better
- older inspection/job/blob-era tables are still contaminating the mental model
- several domains now need deliberate canonical consolidation, not more incremental patching

If this were being rebuilt professionally from first principles, the future architecture would preserve the rug/itemized/logistics backbone and progressively retire the older inspection/job/blob-centric structures from being primary business truth.
