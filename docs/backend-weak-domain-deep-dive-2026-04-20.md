# Backend Weak-Domain Deep Dive - 2026-04-20

## Purpose

This document drills into the structurally weak backend domains:

- services and pricing
- estimates
- invoices and payments
- auth / company scope / RLS boundaries

This is where the backend is most likely to be undermining the rest of the platform.

## 1. Services and pricing deep dive

### What exists

From the generated schema and related code, the service/pricing model currently spans:

- `company_enabled_services`
- `company_service_prices`
- `rug_services`
- `price_overrides`
- `declined_services`
- workflow logic expecting categories and approval semantics

There is also a generated alias/shape surfacing `services`, but the clearer visible base table in the schema appears to be `company_enabled_services`.

### What this implies

The platform has separated at least four concerns:

1. which services are enabled for a company
2. what a company charges for them
3. what was actually selected on a rug
4. what was overridden or declined during inspection/approval flow

That separation could be fine if the model were explicit and tightly keyed.
Right now it does not look that way.

### Structural problems

#### A. Keying by `service_name`
`company_service_prices` visibly stores `service_name` and `unit_price`, but not a clear FK to a canonical service-definition row.

That is bad structure.
If pricing is keyed by string names instead of canonical service ids, drift is almost guaranteed.

#### B. Category semantics are not clearly resident in the catalog layer
Estimate and invoice workflows fetch `services.id, category`, and Check In approval logic depends on service-category understanding.
But the visible thin catalog shape does not clearly expose that as the authoritative base structure.

That means category truth may be:
- in another table
- in extended types only
- in stale generated types
- or partly inferred in code

Any of those is too muddy.

#### C. Inspection-era tables still shape pricing behavior
`price_overrides` and `declined_services` are both tied to `inspection_id` and `job_id`, which points back to the older inspection-centric workflow model.

That means service/pricing truth is currently contaminated by mixed workflow eras.

### Structural judgment
**This is not a clean canonical service architecture.**

### Correct long-term shape
The platform should eventually have:

- one canonical service definition layer
- one canonical company pricing layer keyed by service id, not service name
- one rug-level snapshot layer
- one approval/estimate decision layer

Right now it appears to have fragments of all four without a clean governing center.

## 2. Estimates deep dive

### What exists

There are clearly two estimate models visible in the schema/types:

#### Model A, older/inspection-centric
- `estimates.inspection_id`
- `estimates.job_id`
- `estimates.services` JSON blob
- `estimates.total_amount`
- `approved_by_staff_*`

#### Model B, newer/rug-centric
- `estimates.rug_id`
- `estimates.client_id`
- `estimates.estimate_number`
- `estimates.status`
- `estimates.version`
- `estimates.total`
- `estimate_items`
- workflow function `estimate-workflow`

### What this implies

The backend estimate domain is either:

- partially migrated and not cleaned up
- carrying two concurrent meanings of “estimate”
- or exposing stale generated types that no longer match the live DB shape cleanly

None of those are acceptable as a long-term architecture state.

### Structural problems

#### A. Competing parentage
One estimate model belongs to inspection/job.
The other belongs to rug/client.

That is a direct contradiction in domain ownership.

#### B. Competing line-item representations
One model stores services as JSON on the estimate row.
The other model stores normalized rows in `estimate_items`.

Again, that is not a small detail. It is a different data model.

#### C. Approval semantics are split
Approval state appears across:
- estimate status
- estimate item client approval fields
- rug service approval fields
- inspection-era approval flags

That is far too many places for business truth to hide.

### Structural judgment
**Estimates are the most structurally compromised domain in the backend.**

### Correct long-term shape
The platform needs one estimate model only.
Given current direction, the normalized rug/client/itemized model looks more like the right future than the old inspection JSON model.

## 3. Invoices and payments deep dive

### What exists

#### Invoices
- `invoices`
- `invoice_items`
- `generate-invoice-workflow`
- `invoice-pdf`
- `credit_memos`
- `credit_memo_lines`

#### Payments
Two shapes are visible in the schema area:

- `invoice_payments` / simple client-linked payment structure
- `payments` / richer job-linked payment structure with status, metadata, Stripe ids, platform fees, etc.
- `payment_attempts` / invoice-linked provider attempt history

### What this implies

The finance model appears to have both an older/simple payment structure and a newer/richer payment structure in play, just like estimates had overlapping eras.

### Structural problems

#### A. Overlapping money fields on invoices
`invoices` contains:
- `subtotal`
- `tax`
- `total`
- `total_amount`
- `balance`
- `balance_due`

Without a very explicit canonical policy, this is a classic source of drift.

#### B. Competing payment models
The visible schema suggests both:
- a simple payment record shape
- a richer job-linked payment record shape

If both are live, the finance model is not clean.
If one is legacy, cleanup is overdue.

#### C. Operational logic still determines financial truth
Invoice generation still derives charges from `rug_services` snapshots and category-based minimums at function runtime.

That means pricing truth is still leaking into workflow code rather than being represented in one canonical finance/pricing model.

#### D. Invoice artifact lifecycle is cross-layer and fragile
Invoice generation/download depends on:
- DB invoice rows
- invoice items
- edge function execution
- storage path handling
- auth

That is not inherently wrong, but it means structural weakness anywhere in the stack becomes a production bug quickly.

### Structural judgment
**The invoice/payment domain is salvageable, but not cleanly canonical today.**

### Correct long-term shape
The finance domain should converge on:

- one invoice truth model
- one payment truth model
- one clear artifact lifecycle
- explicit derived fields rather than overlapping writable totals/balances

## 4. Auth / company scope / RLS deep dive

### What exists

Company and auth scope currently depend on a mix of:

- direct `company_id` columns on many tables
- helper RPC `get_user_company_id(auth.uid())`
- insert triggers that backfill `company_id`
- RLS policies added in baseline and follow-up migrations
- edge functions that use service-role clients plus their own role/company resolution checks

### What this implies

The platform uses a hybrid security model:

- DB/RLS for direct table access
- service-role edge functions for privileged workflow execution
- procedural company resolution for many internal checks

That is valid in principle, but only if the boundaries are very clear.

### Structural problems

#### A. Company scope is not self-evident from schema alone
A lot of truth flows through `get_user_company_id`, triggers, and policy SQL.
This makes the system harder to reason about quickly.

#### B. Edge functions bypass normal table-access shape
Functions such as:
- `check-in-workflow`
- `estimate-workflow`
- `generate-invoice-workflow`

all resolve actor identity manually, then use admin/service-role clients.
That is common, but it means business safety depends on function correctness, not just DB shape.

#### C. RLS coverage may be uneven by era
The grep output shows newer hardening migrations for message threads and company-scope additions, but the presence of older baseline policies plus later fixes suggests auth structure has been evolving mid-flight.

### Structural judgment
**Potentially sound, but too procedurally layered to call clean without a dedicated auth/RLS audit.**

### Correct long-term shape
The system should make these boundaries explicit:

- which tables are directly staff-accessed under RLS
- which tables are portal-accessed under RLS
- which workflows only mutate through edge functions
- which company scoping rules are guaranteed by schema/triggers versus function logic

## Cross-domain conclusion

The weak domains are weak for the same underlying reason:

**the system shows signs of multiple overlapping modeling eras, with newer rug/itemized/workflow-oriented structures layered on top of older inspection/job-centric structures, without full re-canonization.**

That is why the platform feels muddy.
It is not just messy code. The business model itself has not been fully consolidated.

## Strongest conclusions from this pass

1. service/pricing truth is too fragmented to trust as-is
2. estimate architecture is currently contradictory
3. finance/payment architecture likely has multiple overlapping generations too
4. auth/company scope is probably enforceable, but not self-evident enough yet

## Required next backend work, from a pure architecture perspective

1. choose and declare one canonical service/pricing model
2. choose and declare one canonical estimate model
3. choose and declare one canonical payment model
4. map direct RLS access versus service-role workflow mutation cleanly
5. retire or isolate legacy-era structures once replacements are confirmed
