# Backend Architecture Map - 2026-04-20

## Purpose

This document maps the current backend architecture from the actual schema/types and active workflow code.

It is not an aspirational design document.
It describes the system we appear to actually have right now, including structural ambiguity where present.

## Source basis

This map is based on direct inspection of:

- `src/integrations/supabase/types.ts`
- `src/integrations/supabase/extended.ts`
- `supabase/functions/check-in-workflow/index.ts`
- `supabase/functions/estimate-workflow/index.ts`
- `supabase/functions/generate-invoice-workflow/index.ts`
- recently added RPC/read-model paths already used by the app

## Top-level backend domains

The backend currently clusters into these domains:

1. tenancy and access
2. clients and accounts
3. intake / jobs / rugs
4. service catalog and pricing
5. estimates and approvals
6. invoices and payments
7. messaging and communication history
8. pickup / delivery / route execution
9. platform settings, notification cadence, and supporting metadata

## 1. Tenancy and access domain

### Core tables

- `companies`
- `company_memberships`
- `user_roles`
- `portal_users`
- `platform_settings`
- `company_branding` (present in schema)

### Apparent relationships

- `clients.company_id -> companies.id`
- `portal_users.client_id -> clients.id`
- `portal_users.company_id -> companies.id`
- `company_memberships.company_id -> companies.id`
- many business tables also carry direct or indirect company scoping

### Interpretation

The backend is trying to support multi-company tenancy with two user classes:

- internal staff users governed by `user_roles` and likely auth users
- client/portal-side users governed through `portal_users`

### Structural notes

- `user_roles` has no visible FK in the generated types to a membership table or company table, so company resolution appears to rely on separate logic/RPC such as `get_user_company_id`
- this is workable, but it means tenancy truth is partly in schema and partly in procedural logic
- company scoping exists as a strong architectural requirement, but the implementation boundary is not fully self-evident from table relationships alone

## 2. Clients and accounts domain

### Core tables

- `clients`
- `portal_users`
- `notification_cadence`
- `notification_throttles` (present in schema)

### Apparent relationships

- `clients.company_id -> companies.id`
- `portal_users.client_id -> clients.id`
- `notification_cadence.client_id -> clients.id`

### Interpretation

`clients` is the central customer/account record for operational work.
It anchors routing, pricing context, messaging, invoices, pickup requests, and portal access.

### Structural notes

- this domain appears relatively sane
- the most important open question is whether client identity and portal identity are modeled cleanly enough for auth and communication workflows

## 3. Intake / jobs / rugs domain

### Core tables

- `jobs`
- `rugs`
- `checkin_photos`
- `inspections`
- possibly `intake_jobs` as an underlying relation name in some FK metadata

### Apparent relationships

- `jobs.client_id -> clients.id`
- `jobs.pickup_request_id -> pickup_requests.id`
- `rugs.client_id -> clients.id`
- `rugs.job_id -> intake_jobs.id` in generated relationship metadata
- `checkin_photos.client_id -> clients.id`
- `checkin_photos.rug_id -> rugs.id`
- `checkin_photos.job_id -> intake_jobs.id`
- `inspections.job_id -> jobs.id`
- `inspections.company_id -> companies.id`

### Interpretation

This domain appears to represent intake events/jobs, physical rugs, inspection findings, and intake photos.

### Structural notes

- `rugs` currently carries both domain-specific columns and a `services: string[]` field, while actual selected/priced services also live in `rug_services`
- that is a structural smell because it suggests duplicate service representation at the rug level
- `rugs.job_id` references `intake_jobs` in metadata while the visible table name in the app/types is `jobs`, which suggests naming drift or compatibility aliasing
- `inspections` looks like part of an older or parallel intake/estimate model rather than a clean companion to the current rug-centric estimate workflow

## 4. Service catalog and pricing domain

### Core tables

- `services`
- `company_service_prices`
- `rug_services`
- supporting logic in check-in / estimate / invoice workflows

### Apparent relationships

- `services.company_id -> companies.id`
- `company_service_prices.company_id -> companies.id`
- `rug_services.rug_id -> rugs.id`
- `rug_services.service_id -> services.id`
- `estimate_items.rug_service_id -> rug_services.id`

### Interpretation

The backend appears to divide service concerns across at least three layers:

1. `services` for enabled catalog entries by company
2. `company_service_prices` for company-specific pricing values
3. `rug_services` for actual per-rug selected service snapshots

### Structural notes

- this domain is one of the biggest structural concerns in the system
- the `services` table shape visible in generated types is too thin to act as a clearly canonical catalog by itself
- workflow code expects categories and business semantics that are not obvious from the base table shape alone
- `rug_services` stores both `service_id` and `service_name`, which is normal for snapshots, but it also means the system can drift if catalog truth is not strong
- approval behavior and pricing behavior currently depend partly on service metadata and partly on name/category heuristics

## 5. Estimates and approvals domain

### Core tables

- `estimates`
- `estimate_items`
- `rug_services`
- `inspections`
- `jobs`
- edge function: `estimate-workflow`
- approval logic in `check-in-workflow`

### Apparent relationships from generated schema

Generated base `estimates` model:
- `estimates.inspection_id -> inspections.id`
- `estimates.job_id -> jobs.id`
- `estimate_items.estimate_id -> estimates.id`
- `estimate_items.rug_service_id -> rug_services.id`

### Apparent relationships from active workflow code / extended typing
nActive app/workflow estimate model:
- estimate belongs to `rug_id`
- estimate optionally belongs to `client_id`
- estimate has `estimate_number`, `status`, `version`, `total`
- line items are normalized in `estimate_items`
- estimate creation is driven from `rug_services` snapshots

### Interpretation

There is strong evidence that estimates are currently the least trustworthy domain in the backend architecture.

### Structural notes

- there appear to be two estimate models or two schema eras overlapping
- the generated schema still exposes an inspection/job/JSON-services estimate shape
- the active app/workflow layer expects a newer rug/client/itemized estimate shape
- this is not a minor inconsistency, it is a core architecture problem
- estimate approvals are also spread across estimate status, item-level client approval fields, and rug-service approval behavior

## 6. Invoices and payments domain

### Core tables

- `invoices`
- `invoice_items`
- `payments`
- `payment_attempts`
- credit memo tables are present nearby in schema
- edge function: `generate-invoice-workflow`
- edge function: `invoice-pdf`

### Apparent relationships

- `invoices.client_id -> clients.id`
- `invoices.delivery_list_id -> delivery_lists.id`
- `invoice_items.invoice_id -> invoices.id`
- `invoice_items.rug_id -> rugs.id`
- `payments.client_id -> clients.id`
- `payment_attempts.client_id -> clients.id`
- `payment_attempts.invoice_id -> invoices.id`

### Interpretation

Invoices appear to be generated from ready rugs by snapshotting `rug_services` into `invoice_items`.
The finance domain exists, but its canonical field ownership is unclear.

### Structural notes

- `invoices` carries many overlapping financial fields: `subtotal`, `tax`, `total`, `total_amount`, `balance`, `balance_due`
- this is a structural smell unless ownership rules are extremely clear
- `payments` in the base schema appears client-oriented, while another nearby shape suggests a job-linked payment variant, which may indicate naming/version drift similar to estimates
- invoice generation still embeds pricing logic like cleaning minimums in workflow code rather than relying on one obvious canonical pricing layer
- the invoice/PDF path clearly spans DB, edge function, storage, and auth concerns, which makes it a cross-domain reliability risk

## 7. Messaging and communication history domain

### Core tables

- `message_threads`
- `messages`
- `communication_events`
- `notification_cadence`

### Apparent relationships

- `message_threads.client_id -> clients.id`
- `messages.thread_id -> message_threads.id`
- `communication_events.client_id -> clients.id`
- `communication_events.estimate_id -> estimates.id`
- `communication_events.invoice_id -> invoices.id`
- `communication_events.rug_id -> rugs.id`
- `notification_cadence.client_id -> clients.id`

### Interpretation

This domain has two distinct concepts:

1. conversational threads/messages
2. event-style communication logs tied to business entities

### Structural notes

- that split can be valid, but the boundary is not yet crisp
- `communication_events` risks becoming a catch-all business event log unless its purpose is made explicit
- threaded messaging appears simpler and more normalized than event logging
- notification scheduling/throttling adds a third layer of communication-related state

## 8. Pickup / delivery / route execution domain

### Core tables

- `pickup_requests`
- `pickup_request_items`
- `delivery_lists`
- `delivery_list_items`
- `route_stops`
- `route_stop_items`

### Apparent relationships

- `pickup_requests.client_id -> clients.id`
- `pickup_request_items.pickup_request_id -> pickup_requests.id`
- `pickup_request_items.rug_id -> rugs.id`
- `pickup_request_items.checked_in_rug_id -> rugs.id`
- `delivery_list_items.delivery_list_id -> delivery_lists.id`
- `delivery_list_items.client_id -> clients.id`
- `delivery_list_items.rug_id -> rugs.id`
- `route_stops.client_id -> clients.id`
- `route_stops.delivery_list_id -> delivery_lists.id`
- `route_stops.pickup_request_id -> pickup_requests.id`
- `route_stop_items.route_stop_id -> route_stops.id`
- `route_stop_items.delivery_list_item_id -> delivery_list_items.id`
- `route_stop_items.pickup_request_item_id -> pickup_request_items.id`
- `route_stop_items.rug_id -> rugs.id`

### Interpretation

This is one of the most structurally understandable parts of the backend.
It models scheduled pickups, grouped deliveries, stop execution, and stop-item evidence reasonably directly.

### Structural notes

- there is some duplication of route intent across delivery/pickup lists and route stops, but that is understandable for planning versus execution layers
- this domain appears much more coherent than estimates and finance
- the idempotent truck-loading fix aligns well with this model

## 9. Supporting metadata and operational infrastructure

### Core elements

- `platform_settings`
- `notification_cadence`
- throttling functions and helper RPCs
- read-model RPCs like jobs summary, thread summaries, delivery prep snapshot, check-in pending pickups

### Interpretation

This layer is increasingly being used to build backend-shaped operational summaries rather than forcing the frontend to join and shape raw tables.
That direction is good and should continue.

## Current architectural strengths

- client and route-oriented operational data exists and is reasonably connected
- pickup/delivery/route execution modeling is comparatively coherent
- backend-shaped summary/RPC strategy is sound
- company scoping is clearly treated as a real requirement
- rug-service snapshots provide a workable bridge between intake operations and downstream estimate/invoice generation

## Current architectural weaknesses

### 1. Parallel or drifting schema eras
The biggest sign is the estimate model mismatch between generated schema and active workflow assumptions.

### 2. Service truth fragmentation
Catalog enablement, pricing, category semantics, and per-rug snapshots are not cleanly centralized.

### 3. Duplicate/overlapping representations
Examples:
- `rugs.services` array versus normalized `rug_services`
- `communication_events` versus `message_threads/messages`
- invoice money fields with overlapping meanings

### 4. Procedural truth compensating for weak schema truth
Company resolution, pricing rules, approval rules, and invoice minimum logic are all at least partly enforced in functions instead of resting on obviously canonical schema structures.

### 5. Naming drift
Examples:
- `jobs` versus `intake_jobs` relationship naming
- `estimates` appearing in two different structural forms
- nearby signs of multiple payment-related shapes

## Working domain-by-domain confidence

### Higher confidence
- clients/accounts
- pickup requests and delivery execution
- route stops and stop items
- rug-service snapshot concept

### Medium confidence
- Check In operational backend
- threaded messaging model
- jobs as an operational aggregate

### Low confidence
- canonical service catalog/pricing/approval model
- estimates domain
- invoice field ownership and finance model
- communication event ownership boundaries
- company/auth/RLS implementation boundaries

## Working conclusion

The backend is not random chaos, but it is also not a cleanly unified architecture.

The strongest current interpretation is:

- operations/logistics domains are comparatively coherent
- service, estimate, invoice, and communication-history domains show meaningful structural drift
- the platform has enough real backbone to salvage, but only if the ambiguous domains are re-canonized rather than patched indefinitely
