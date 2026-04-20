# Platform Reevaluation Master Plan - 2026-04-20

## Executive summary

This platform should no longer be treated as a normal feature-delivery codebase.

It should be treated as an existing operational system with real domain value, unclear trust boundaries, mixed frontend quality, and likely deeper backend inconsistency than first assumed.

The correct path is not blind continuation and not a literal wipe-to-zero rewrite.

The correct path is a **controlled platform recovery and rebuild**:

1. establish backend and workflow truth
2. identify what is trustworthy vs dangerous
3. stabilize the highest-risk operational paths
4. rebuild the product route-by-route against canonical business rules

## Why the platform is being reevaluated

The project now shows several signs that normal iteration is no longer enough:

- operational confidence is too low
- some workflows appear fragile or contradictory
- frontend experience has become uneven and difficult to trust uniformly
- backend truth and schema semantics may be more compromised than the frontend alone suggests
- business rules around estimates, approvals, services, invoices, and messaging are not cleanly centralized
- each new change currently risks exposing another hidden inconsistency

This is a trust problem, not just a velocity problem.

## Project objective

Build a reliable operational platform for rug cleaning and restoration that is:

- correct in business behavior
- fast enough for real shop use
- stable during live operations
- understandable for office and facility staff
- maintainable over time
- auditable at the data and workflow level
- safe for live client/rug/estimate/invoice data

## Core principles

### Product principles

- shop operations first
- correctness before automation convenience
- staff-facing speed matters because the work is physical and time-sensitive
- office review responsibilities must be explicit
- grouped company/client workflows matter where the business works in groups
- client-visible actions should not happen implicitly when operational review is still required
- layout stability and UI calm are operational requirements, not polish

### Engineering principles

- one source of truth per concept
- backend truth before frontend polish
- additive migrations first
- no destructive schema changes without explicit review and rollback planning
- one canonical workflow per business process
- no duplicate hidden write paths
- no guessing when production evidence is available
- critical paths must be verifiable live, not only through local tests

## Program structure

## Phase 1. Platform truth audit

### Goal

Determine what is trustworthy, what is dangerous, and what the real business model currently is.

### Scope

- schema and table semantics
- edge functions
- RPCs and views
- triggers and automations
- RLS and auth assumptions
- workflow ownership
- read-model reliability
- PDF/artifact generation paths
- message and notification paths

### Outputs

- backend truth audit report
- workflow dependency inventory
- risk classification by subsystem
- keep / repair / rebuild / remove matrix

## Phase 2. Canonical business model definition

### Goal

Define how the business should work independent of current implementation accidents.

### Scope

- clients and companies/accounts
- rugs and rug lifecycle
- services and service pricing families
- approvals and estimate-required rules
- estimates lifecycle
- invoices lifecycle
- jobs lifecycle
- messaging and communication records
- deliveries and truck loading
- payments and credits

### Outputs

- canonical domain model
- canonical status/transition definitions
- canonical pricing/approval rules

## Phase 3. Backend integrity stabilization

### Goal

Make the backend trustworthy enough to support rebuild work.

### Scope

- highest-risk workflow corrections first
- duplicate or conflicting write-path cleanup
- schema safety improvements
- typed bindings and RPC/read-model alignment
- live verification for critical paths

### Priority order

1. invoice generation/download/send path
2. estimate lifecycle and grouped office review model
3. service catalog truth and approval behavior
4. payments / invoice integrity
5. messaging/thread workflow integrity
6. jobs and delivery operational summaries

## Phase 4. Route-by-route rebuild

### Goal

Rebuild the frontend against the now-defined backend truth.

### Rebuild order

1. Check In
2. Estimates
3. Invoices
4. Jobs
5. Messaging / office coordination
6. Logistics / deliveries / driver surfaces

### Rules

- rebuild one vertical slice at a time
- each slice gets a clear done definition
- no mixing unrelated redesigns into a bug recovery slice

## Immediate freeze rules

Until reevaluation is complete:

- no random new feature work
- no styling work attached to functional debugging
- no schema rewrites without audit evidence
- no new automation that changes business behavior without explicit model definition
- no speculative patch stacking on live operational workflows

## Current top risks

1. backend truthworthiness may be worse than frontend quality suggests
2. estimate lifecycle is not clean enough for office review ownership
3. invoice download / artifact path is unreliable and undermines trust
4. service catalog and approval semantics appear vulnerable to drift
5. frontend code may be compensating for backend ambiguity in hidden ways
6. the platform currently lacks clear trust boundaries between proven and unproven subsystems

## Recommended delivery sequence

### Step 1
Complete a backend truth audit before further broad rebuild work.

### Step 2
Define the canonical business model and workflow transitions.

### Step 3
Repair highest-risk backend integrity issues.

### Step 4
Resume route-by-route rebuild against canonical truth.

## First applied classification

The first working classification is documented in:

- `docs/platform-subsystem-classification-2026-04-20.md`

Current headline judgment:

- Check In: repair and verify
- Services / pricing / approvals: audit first, then repair
- Estimates: rebuild
- Invoices: audit first, then repair or rebuild depending on backend truth
- Payments / credits: audit first
- Jobs: repair
- Messaging / inbox / threads: repair
- Delivery Prep: repair
- Driver portal / truck loading: repair
- Portal estimate visibility: rebuild after estimate lifecycle is redefined
- PDF artifact path: audit first, then repair
- Company / auth / RLS model: audit first

## Backend truth audit progress

First concrete audit pass completed in:

- `docs/backend-truth-audit-pass-01-2026-04-20.md`

Headline findings from pass 01:

- dual estimate models appear to coexist between generated schema and active workflow assumptions
- service truth appears fragmented across enablement, pricing, and category logic
- invoice creation is tightly coupled to operational `rug_services` snapshots and category heuristics
- `communication_events` and threaded messaging have an unclear ownership boundary
- delivery/pickup structures currently look more coherent than estimates/invoices

## What should not happen

- do not declare the platform a clean greenfield rewrite until salvage value is disproven
- do not keep layering patches on top of undefined backend semantics
- do not continue frontend cleanup as if backend truth were already known
- do not conflate faster development with lower rigor

## Working conclusion

This platform should be treated as a **controlled recovery and rebuild project**.

The backend and workflow layer must be re-truthed first.
The frontend should then be rebuilt against that truth deliberately, not patched reactively.
