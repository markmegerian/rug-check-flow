# Backend Truth Audit Checklist - 2026-04-20

## Purpose

This checklist is for auditing the real trustworthiness of the platform backend before further broad rebuild work.

The goal is not just to list tables.
The goal is to identify:

- what each backend component means
- what writes to it
- what reads from it
- whether it is authoritative, derived, duplicated, stale, or dangerous

## Audit classification labels

Every subsystem should be classified as one of:

- **trustworthy**
- **salvageable**
- **dangerous**
- **replace**
- **unknown, requires verification**

## Section 1. Core tables

For each table below, answer:

- what business concept does it represent
- what is the source of truth vs derived data
- what code paths write to it
- what code paths read from it
- what statuses/fields are authoritative
- what columns are duplicated, stale, or ambiguous
- what constraints are missing
- what business workflows depend on it

### Client / company layer

- `clients`
- company / membership / branding tables
- `portal_users`
- `user_roles`

### Rug and service layer

- `rugs`
- `services`
- `rug_services`

### Estimate layer

- `estimates`
- `estimate_items`

### Invoice and payment layer

- `invoices`
- `invoice_items`
- `payments`
- credit / memo related tables if present

### Job and production layer

- jobs-related tables and derived job summaries
- workflow or production-stage artifacts

### Communication layer

- `message_threads`
- `messages`
- `communication_events`

### Delivery / logistics layer

- `delivery_lists`
- `delivery_list_items`
- `pickup_requests`
- route/delivery proof artifacts

## Section 2. Edge functions

For each edge function, record:

- purpose
- caller surfaces
- auth model
- critical dependencies
- whether it is business-critical
- whether it mutates live workflow data
- whether it is trustworthy, salvageable, dangerous, or replace-worthy

Priority functions:

- `check-in-workflow`
- `estimate-workflow`
- `generate-invoice-workflow`
- `invoice-pdf`
- any estimate send / invoice send / notification functions
- any delivery / logistics workflow functions

## Section 3. RPCs, views, and read models

For each RPC/view/read model:

- what screen depends on it
- whether it is canonical or a temporary summary path
- whether it matches the real schema/business meaning
- whether it duplicates logic from frontend or other backend paths

Priority items:

- jobs summary RPCs
- thread summary RPCs
- delivery prep snapshot RPCs
- check-in pending snapshot RPCs
- any invoice / estimate summary loaders

## Section 4. Business rules audit

Define the single source of truth for:

- standard cleaning approval
- estimate-required behavior
- service pricing family logic
- custom price handling
- invoice due-date rules
- company scoping rules
- portal visibility rules
- office review vs client-visible lifecycle rules

Mark every place those rules are duplicated.

## Section 5. Auth and RLS audit

For each critical workflow, answer:

- who should be allowed to perform it
- how auth is enforced now
- whether access is enforced by RLS, function logic, both, or neither
- whether current auth behavior matches real operational use

Priority workflows:

- invoice download
- estimate review/send
- portal approvals/rejections
- payment recording
- delivery list mutations
- check-in workflow invocation

## Section 6. Smell detection

Explicitly look for:

- duplicate concepts in multiple tables
- status columns with overloaded meaning
- data copied for convenience with no ownership boundary
- missing uniqueness constraints
- missing foreign keys or weak links
- hidden frontend-only invariants
- functions that depend on naming heuristics instead of canonical model truth
- legacy columns still affecting active behavior

## Section 7. Deliverables required from the audit

At the end of the audit, produce:

1. a table-by-table classification
2. a function-by-function classification
3. a list of canonical truths
4. a list of dangerous inconsistencies
5. a recommended repair order
6. a list of components that should be rebuilt rather than repaired
