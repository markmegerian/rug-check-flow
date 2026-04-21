# Backend Canonical Target Schema - 2026-04-21

## Purpose

This document defines the target backend architecture the platform should converge toward.

It is not the current schema.
It is the canonical structure the current backend should be consolidated into.

The target is designed to preserve the strong operational backbone already present while removing hybrid-era ambiguity.

## Design goals

- one source of truth per business concept
- no competing estimate models
- no competing payment models
- no pricing keyed primarily by names
- no duplicated service truth across rug fields and service snapshot tables
- clear separation between conversational messaging and business-event logging
- preserve company scoping cleanly
- preserve live data safely through additive migration and staged cutover

## Canonical domain model

## 1. Tenancy and identity

### Keep as canonical
- `companies`
- `company_memberships`
- internal auth users + roles
- `portal_users`
- `company_branding`

### Canonical rules
- every tenant-owned operational record should either carry `company_id` directly or be reachable through a single unambiguous parent that does
- internal-user company access should be provable through memberships/roles, not only inferred through helper logic
- portal identity should be client-bound and company-bound

## 2. Clients and operational entities

### Keep as canonical
- `clients`
- `rugs`
- `pickup_requests`
- `pickup_request_items`
- `delivery_lists`
- `delivery_list_items`
- `route_stops`
- `route_stop_items`

### Canonical rules
- `clients` is the client/account truth
- `rugs` is the physical-item truth
- route and logistics structures remain planning/execution truth
- no duplicate alternate operational item model should compete with rugs for primary operational identity

## 3. Services and pricing

## Canonical target tables

### `service_definitions`
Purpose: canonical service catalog per company

Target shape:
- `id`
- `company_id`
- `code` or stable internal key
- `name`
- `category`
- `pricing_model` (`per_sqft`, `per_linear_ft`, `per_rug`, `custom`)
- `requires_estimate`
- `requires_office_approval`
- `is_active`
- display/order metadata as needed
- timestamps

### `service_prices`
Purpose: canonical current price for a company service definition

Target shape:
- `id`
- `service_definition_id`
- `company_id`
- `unit_price`
- `minimum_price` if business rules require it
- `is_active`
- timestamps

### `rug_services`
Purpose: per-rug service snapshot selected at operation time

Canonical retained shape:
- `id`
- `rug_id`
- `service_definition_id`
- snapshot `service_name`
- snapshot `category`
- snapshot `pricing_model`
- `unit_price`
- `quantity` / dimensions as needed
- `line_total`
- `approval_status`
- metadata for edges/custom price
- timestamps

### Canonical rules
- company pricing must key off canonical service ids, not names
- rug service rows are snapshots, not catalog truth
- category/approval semantics come from service definition truth, not name heuristics
- `rugs.services` should not remain a competing source of truth

## 4. Estimates

## Canonical target tables

### `estimates`
Purpose: estimate header / lifecycle record

Target shape:
- `id`
- `company_id`
- `client_id`
- optional `rug_id`
- `estimate_number`
- `status` (`draft`, `needs_office_review`, `ready_to_send`, `sent`, `approved`, `rejected`, `needs_revision`, optional `expired`)
- `version`
- `total`
- `created_by`
- `reviewed_by`
- `sent_at`
- `approved_at`
- `rejected_at`
- `expires_at`
- timestamps

### `estimate_items`
Purpose: normalized estimate lines

Target retained direction:
- `id`
- `estimate_id`
- optional `rug_service_id`
- optional `service_definition_id`
- `description`
- `quantity`
- `unit_price`
- `total`
- `service_category`
- optional client decision fields only if truly needed at line level
- timestamps

### Canonical rules
- there must be only one estimate header model
- estimate truth must be itemized, not blob-based
- office review and explicit send become first-class lifecycle states
- inspection/job-era estimate tables should not remain primary truth

## 5. Invoices and finance

## Canonical target tables

### `invoices`
Purpose: invoice header / lifecycle / artifact reference

Target shape:
- `id`
- `company_id`
- `client_id`
- optional `delivery_list_id`
- `invoice_number`
- `status`
- `issued_at`
- `due_at`
- `paid_at`
- `subtotal`
- `tax_total`
- `discount_total` if needed
- `total`
- `balance_due`
- `pdf_storage_path`
- timestamps

### `invoice_items`
Purpose: normalized invoice lines

Retain direction:
- `id`
- `invoice_id`
- optional `rug_id`
- optional `service_definition_id`
- description / quantity / unit_price / total
- timestamps

### `payments`
Purpose: canonical payment ledger

Target shape:
- `id`
- `company_id`
- `client_id`
- optional `invoice_id` only if single-invoice payments are allowed directly
- `amount`
- `currency`
- `method`
- `status`
- `received_at`
- `paid_at`
- provider references / metadata
- `entered_by`
- timestamps

### `payment_allocations`
Purpose: payment distribution across invoices

Retain direction:
- `id`
- `payment_id`
- `invoice_id`
- `amount`
- timestamps

### `credit_memos`
### `credit_memo_lines`
Retain as finance adjustments if actively needed

### Canonical rules
- choose one payment model, not two
- `invoice_payments` should be retired if `payments` + `payment_allocations` becomes canonical
- totals/balances on invoices must have explicit derivation rules
- invoice generation may still originate from rug services, but finance truth should live in invoice rows/items once issued

## 6. Messaging and communication

## Canonical target tables

### `message_threads`
### `messages`
Retain as the conversational model

### `communication_events`
Retain only as a bounded business event log if needed

Target event-log role:
- delivery of estimate sent
- invoice issued
- payment reminder sent
- system-generated client notification recorded

Not for:
- free-form conversational history
- duplicated note-taking that belongs in thread messages

### Canonical rules
- one conversation model
- one bounded event log
- no overlapping catch-all communication tables as primary truth

## 7. Jobs

## Canonical decision
Jobs should remain only if the business truly needs an aggregate operational wrapper spanning rugs, communication, and lifecycle.

If retained, jobs should be:
- clearly company-scoped
- clearly client-scoped or linked
- explicitly defined as aggregate operational containers, not finance or estimate truth containers

If not, legacy job-era tables should stop acting as parent truth for estimates/payments.

## Legacy / non-canonical structures to retire or isolate

These should not remain primary truth in the target architecture:

- `approved_estimates`
- blob-based estimate services fields as primary truth
- `declined_services` as a primary service truth source
- `price_overrides` if it remains inspection/job-era only and not linked into canonical service snapshot history
- `invoice_payments` if canonical payments are handled elsewhere
- `rugs.services` string array as active service truth
- duplicate/older communication tables that overlap with threads + event log

## Migration rules

- do not drop live legacy tables first
- add canonical structures or missing columns first
- dual-write or backfill where necessary
- cut reads and writes one domain at a time
- verify live behavior after each cutover
- only retire legacy structures after new truth is stable

## Final judgment

The canonical target backend should preserve the current rug/logistics backbone and consolidate the platform around:

- canonical service definitions
- canonical service pricing keyed by service ids
- one normalized estimate model
- one normalized invoice model
- one payment ledger + allocation model
- one conversation model
- one bounded communication-event model

That is the backend shape the platform should be moving toward.
