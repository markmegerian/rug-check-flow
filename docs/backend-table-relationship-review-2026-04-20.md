# Backend Table and Relationship Review - 2026-04-20

## Purpose

This document reviews whether the current backend tables and relationships make sense structurally, and where they appear under-modeled, duplicated, or confusing.

It is based on the current generated schema/types plus active workflow code.

## Review standard

Each area is judged against these questions:

- does the table represent one clear concept
- are parent/child relationships understandable
- are important foreign keys present
- is the source of truth obvious
- is duplicate representation being used in ways likely to drift
- are workflow semantics embedded in structure or scattered in code

## 1. Clients and tenancy

### Tables reviewed
- `companies`
- `company_memberships`
- `clients`
- `portal_users`
- `user_roles`

### Structural judgment
**Mostly sensible, but incomplete from relationship visibility alone**

### What makes sense
- `clients -> companies` is appropriate
- `portal_users -> clients` is appropriate
- `portal_users -> companies` is appropriate
- `company_memberships -> companies` is appropriate

### Concerns
- `user_roles` looks detached from company structure in schema terms
- company resolution appears to require RPC/procedural logic rather than being fully obvious from relational shape
- this may be acceptable, but it weakens self-documenting clarity

### Verdict
**Salvageable and probably structurally okay, but auth/company truth needs deeper audit**

## 2. Rugs, jobs, and intake

### Tables reviewed
- `jobs`
- `rugs`
- `checkin_photos`
- `inspections`

### Structural judgment
**Mixed**

### What makes sense
- rugs belonging to clients makes sense
- jobs belonging to clients makes sense
- photos linked to rugs and jobs makes sense
- inspections linked to jobs makes sense if inspections are a true job-stage entity

### Concerns
- `rugs.services` is likely redundant with `rug_services`
- `rugs.job_id` referencing `intake_jobs` while the active table is surfaced as `jobs` suggests naming drift
- `inspections` may belong to an older estimate-generation model that now overlaps with the newer rug/itemized estimate path

### Verdict
**Core intake structure is salvageable, but the rug/job/inspection relationship story is not clean enough yet**

## 3. Services and pricing

### Tables reviewed
- `services`
- `company_service_prices`
- `rug_services`

### Structural judgment
**Not cleanly structured enough today**

### What makes sense
- per-rug selected service snapshots in `rug_services` make sense
- separate company-specific pricing can make sense in principle

### Concerns
- `services` appears too thin to be the canonical catalog by itself
- service metadata needed by workflows is not obvious in the base schema shape
- pricing, enablement, and business categorization appear split across multiple places
- `rug_services` stores both `service_id` and `service_name`, which is fine for snapshots, but only if the catalog layer is strong and canonical
- approval logic depending on category/name heuristics is a symptom of weak structural truth here

### Verdict
**This area does not yet make clean relational sense as a canonical business model**

## 4. Estimates

### Tables reviewed
- `estimates`
- `estimate_items`
- `rug_services`
- `inspections`

### Structural judgment
**Structurally contradictory**

### What makes sense
- a normalized `estimate_items` child table is the right direction
- linking estimate items to `rug_services` can make sense if estimates are built from rug service snapshots

### Concerns
- the base schema exposes an estimate model tied to `inspection_id` and `job_id` with JSON `services`
- active workflow code expects an estimate model tied to `rug_id` and `client_id` with itemized rows and explicit statuses
- those are not small variations, they are different domain models
- if both are live, the architecture is contradictory
- if one is legacy but still present in live types, then cleanup and alignment are overdue

### Verdict
**Estimates are currently the most structurally suspect domain in the backend**

## 5. Invoices and payments

### Tables reviewed
- `invoices`
- `invoice_items`
- `payments`
- `payment_attempts`

### Structural judgment
**Partly sensible, but field ownership is muddy**

### What makes sense
- `invoice_items -> invoices` makes sense
- `invoice_items -> rugs` makes sense for rug-linked billing
- `payment_attempts -> invoices` makes sense
- `invoices -> clients` makes sense

### Concerns
- `invoices` has too many overlapping money columns without clear canonical ownership from structure alone
- invoice generation depends on `rug_services` operational snapshots and workflow code heuristics, which means the data model is not carrying enough of the truth itself
- `payments` appears client-linked, but nearby schema evidence suggests multiple payment-related shapes or naming drift
- invoice/PDF generation is not represented as a clean artifact lifecycle inside the data model itself

### Verdict
**The invoice/payment domain is salvageable, but not yet structured clearly enough to trust without further audit**

## 6. Messaging and communication history

### Tables reviewed
- `message_threads`
- `messages`
- `communication_events`
- `notification_cadence`

### Structural judgment
**Two reasonable submodels with a muddy boundary**

### What makes sense
- `message_threads -> clients` makes sense
- `messages -> message_threads` makes sense
- notification cadence by client makes sense
- communication events tied to business entities can make sense

### Concerns
- `communication_events` overlaps conceptually with both notifications and business communication history
- if `communication_events` is used as a general-purpose activity log, the structure is too underspecified
- if portal/client communication history is split across both tables, the truth boundary is weak

### Verdict
**Threaded messaging is structurally fine, but communication history as a whole is not yet clearly owned**

## 7. Pickup, delivery, and route execution

### Tables reviewed
- `pickup_requests`
- `pickup_request_items`
- `delivery_lists`
- `delivery_list_items`
- `route_stops`
- `route_stop_items`

### Structural judgment
**This is the cleanest part of the backend reviewed so far**

### What makes sense
- request header + request items is good structure
- delivery list header + delivery items is good structure
- route stop header + stop items is good structure
- linking route execution back to source delivery/pickup records is good structure
- linking stop items to rugs where applicable is good structure

### Concerns
- some duplication exists across planning layers and execution layers, but it is understandable
- company scoping visibility in these tables should still be checked during auth/RLS audit

### Verdict
**Appropriately structured overall, with normal operational complexity rather than architectural confusion**

## 8. Cross-cutting structural smells

### A. Duplicate representation
Examples:
- `rugs.services` vs `rug_services`
- estimate JSON services vs normalized estimate items
- message history vs communication events
- invoice money fields with overlapping semantics

### B. Naming drift
Examples:
- `jobs` vs `intake_jobs`
- older and newer estimate shapes
- multiple payment-related shapes nearby in schema/types

### C. Code carrying business truth that schema should clarify
Examples:
- company resolution through RPCs
- pricing minimums in invoice generation logic
- approval semantics inferred from service metadata/name heuristics

### D. Mixed modeling eras
The backend appears to contain both:
- earlier job/inspection-centric structures
- newer rug/itemized workflow structures

That is not automatically fatal, but it is the core source of ambiguity right now.

## Domain verdict summary

### Structurally strongest
- clients/accounts
- pickup requests
- delivery lists
- route stops
- route stop items

### Structurally usable but needs cleanup
- rugs/jobs/check-in records
- threaded messaging
- invoice line-item structure

### Structurally weak / likely needs re-canonization
- services and pricing model
- estimates domain
- invoice field ownership
- communication event ownership boundaries

## Final judgment

Do the current backend tables and relationships make sense?

**Some do. Some clearly do not.**

The platform is not uniform.

- logistics and route execution are reasonably well structured
- core client linkage is mostly sensible
- finance and estimate layers are not yet cleanly modeled
- services/pricing truth is too fragmented
- multiple overlapping schema eras are likely still present

So the professional conclusion is:

**the backend can be salvaged, but only after the weak domains are re-canonized and the duplicate/overlapping representations are reduced or clearly bounded.**
