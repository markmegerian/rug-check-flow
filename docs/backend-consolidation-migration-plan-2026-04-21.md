# Backend Consolidation Migration Plan - 2026-04-21

## Purpose

This document defines the safe migration sequence from the current hybrid backend to the canonical target architecture.

This is an architecture migration plan, not a single SQL migration.

## Principles

- additive first
- one weak domain at a time
- no destructive cuts before live verification
- canonical truth must be declared before data moves
- frontend read/write paths must be cut over deliberately
- legacy structures are isolated before removal

## Migration sequence overview

1. service/pricing consolidation
2. estimate model consolidation
3. invoice/payment consolidation
4. communication model consolidation
5. job/inspection legacy isolation
6. final legacy retirement

## Phase 1. Service and pricing consolidation

### Objective
Create one canonical service backbone that all downstream workflows can trust.

### Steps
1. introduce canonical service-definition structure if missing
2. introduce canonical company pricing keyed by service id if missing
3. add any missing fields needed for category, pricing model, estimate-required, approval-required semantics
4. backfill canonical service ids into `rug_services` where possible
5. update Check In, estimate generation, and invoice generation to resolve through canonical service ids first
6. stop relying on service-name matching as a primary mechanism
7. preserve snapshot fields on `rug_services` for historical accuracy

### Verification
- same live service catalog appears in Check In
- standard cleaning resolves without aliases as the primary mechanism
- approval behavior follows canonical service flags, not heuristics
- invoice generation totals match expected service prices

### Legacy to isolate after cutover
- name-keyed company pricing behavior
- service-name heuristics as primary truth

## Phase 2. Estimate model consolidation

### Objective
Make one estimate model canonical.

### Steps
1. confirm the canonical estimate header shape
2. add any missing header fields needed for office review/send lifecycle
3. ensure `estimate_items` fully supports the target model
4. backfill or map old inspection/job/blob estimate records into the canonical estimate shape where needed
5. rewrite active estimate creation/revision/send/review flows to use only canonical estimate tables
6. redirect portal estimate visibility to the canonical estimate model
7. stop writing new primary estimate truth into inspection-era structures

### Verification
- new estimates are created only in canonical tables
- office review queue can be derived only from canonical estimate statuses
- portal/client estimate visibility reflects only canonical estimate truth
- revised estimates preserve version lineage cleanly

### Legacy to isolate after cutover
- `approved_estimates`
- estimate JSON/blob payloads as primary truth
- inspection-centric estimate parentage if no longer required

## Phase 3. Invoice and payment consolidation

### Objective
Make finance data canonical and self-consistent.

### Steps
1. declare exact ownership/derivation of invoice totals and balances
2. normalize invoice header fields so only canonical money fields remain active truth
3. decide whether `payments` + `payment_allocations` is canonical
4. backfill and align invoice-linked payment history into the canonical payment model
5. stop writing new business truth into redundant payment tables
6. update invoice generation to populate canonical invoice fields only
7. isolate invoice artifact lifecycle and make download generation traceable

### Verification
- invoice totals and balance due reconcile consistently
- payment posting updates balances through one canonical path
- invoice download/PDF path works from canonical invoice data only
- no duplicate payment records appear across parallel tables for the same event

### Legacy to isolate after cutover
- `invoice_payments` if redundant
- overlapping writable total/balance fields without canonical ownership

## Phase 4. Communication model consolidation

### Objective
Clarify which tables represent conversations versus business event logs.

### Steps
1. declare `message_threads` + `messages` as the only conversational history model
2. declare `communication_events` as a bounded event log only if needed
3. classify `interactions` and any other overlapping communication tables as canonical or legacy
4. redirect new communication writes to the correct layer only
5. stop duplicating conversational content into event-log tables

### Verification
- office inbox uses only thread/message truth for conversations
- estimate/invoice send events appear in bounded event logs only
- portal message history shows no duplication/leakage

### Legacy to isolate after cutover
- overlapping communication/activity tables with no clear unique purpose

## Phase 5. Job and inspection legacy isolation

### Objective
Reduce contamination from older job/inspection-era structures.

### Steps
1. explicitly define whether jobs remain canonical operational aggregates
2. define whether inspections remain active operational records or legacy artifacts
3. if jobs stay, remove their implicit ownership over estimates/payments where no longer appropriate
4. if inspections stay, narrow them to their true operational role instead of estimate truth ownership

### Verification
- estimates no longer depend on old inspection/job/blob structures as primary truth
- payments and invoices no longer depend on ambiguous job-era relationships
- operational reporting still works after isolation

### Legacy to isolate after cutover
- inspection-era estimate and pricing artifacts as primary truth
- any job-era parentage that conflicts with rug-centric workflows

## Phase 6. Legacy retirement

### Objective
Safely remove or archive obsolete hybrid-era structures.

### Steps
1. mark legacy tables/paths read-only first
2. verify no active code path writes to them
3. snapshot/archive if required
4. remove unused reads
5. remove unused writes
6. remove legacy structures only after rollback confidence is acceptable

## Suggested implementation order

### First actual implementation domain
**Services/pricing**

Why first:
- it contaminates Check In, estimates, approvals, and invoices
- canonical service truth is prerequisite to safe downstream consolidation

### Second
**Estimates**

Why second:
- currently the most structurally contradictory domain
- office review/send model depends on this

### Third
**Invoices/payments**

Why third:
- finance should be rebuilt on top of a clean service/estimate model, not before

### Fourth
**Communication model**

Why fourth:
- important, but less foundational than service/estimate/finance truth

## Risk controls

For every consolidation slice:

- document current truth and target truth first
- build additive schema first
- backfill carefully
- dual-read or validation-read where needed
- cut one write path at a time
- run live verification before removing fallback/legacy behavior
- commit and push each slice separately

## Final judgment

The backend should not be “cleaned up” randomly.
It should be consolidated in a strict sequence:

1. services/pricing
2. estimates
3. finance
4. communications
5. job/inspection legacy isolation
6. retirement of obsolete structures

That is the professional way to get out of the current hybrid-state mud without risking live operational data.
