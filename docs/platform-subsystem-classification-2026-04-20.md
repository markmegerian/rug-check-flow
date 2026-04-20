# Platform Subsystem Classification - 2026-04-20

## Purpose

This document applies the keep / repair / rebuild / remove / audit-first framework to the current platform based on the evidence gathered so far.

These classifications are working judgments, not emotional reactions.
They should be updated only when audit evidence changes the underlying conclusion.

## Classification legend

- **Keep**: preserve as-is except for normal maintenance
- **Repair**: preserve the core model, fix targeted integrity or workflow problems
- **Rebuild**: replace the current implementation while preserving only the proven underlying domain truth
- **Remove**: delete because it is dead, duplicative, or harmful
- **Audit first**: do not make large design commitments until backend truth is verified

## Current subsystem classification

### 1. Check In
**Classification:** Repair, then verify live continuously

**Why:**
- recent work indicates the route can be improved materially without full backend replacement
- the staged intake direction appears right
- live user testing suggested it was working well enough to continue
- however, it is not trustworthy enough to declare completely closed without more real use

**Implication:**
- preserve the current staged direction
- do not redesign again immediately
- tighten correctness and live verification only

### 2. Services / pricing / approval model
**Classification:** Audit first, then repair

**Audit status:** Pass 01 confirms this area is genuinely dangerous, not just uncertain.

**Why:**
- live catalog truth and frontend assumptions have already diverged
- approval behavior was found to be brittle on category/name assumptions
- this area affects Check In, estimates, invoicing, and portal behavior

**Implication:**
- do not continue broad UI work here until canonical service truth is defined
- backend truth audit is required first

### 3. Estimates workflow
**Classification:** Rebuild

**Audit status:** Pass 01 found evidence of dual estimate models between generated schema and active workflow logic.

**Why:**
- current lifecycle is not aligned to the desired business process
- office review ownership is not explicit enough
- grouped company/client review and end-of-day batch send are required
- user explicitly approved a deeper rewrite because estimates are not a live critical dependency right now

**Implication:**
- do not patch the current estimate UX incrementally
- rebuild from a canonical business model

### 4. Invoices workflow
**Classification:** Audit first, then repair or rebuild depending on backend truth

**Audit status:** Pass 01 confirmed the current invoice path is coupled directly to `rug_services` snapshots and pricing/category heuristics.

**Why:**
- invoice PDF/download path is currently not reliable enough
- confidence in invoice-related operational truth is low
- there may be a deeper auth/runtime/backend issue beyond the recent failed detour

**Implication:**
- freeze aesthetic work here
- audit backend truth and repair the baseline operational path first
- if the lifecycle model itself is also compromised, escalate to rebuild

### 5. Payments / credits
**Classification:** Audit first

**Why:**
- this area is financially sensitive
- confidence is too low to make casual changes
- likely backend integrity matters more than surface UX here

**Implication:**
- no broad edits until canonical model and invariants are documented

### 6. Jobs
**Classification:** Repair

**Why:**
- backend summary cutover work already produced structural gains
- there is evidence that the screen benefits from backend-shaped reads rather than browser synthesis
- the business concept itself still appears valid

**Implication:**
- preserve the concept
- continue cleanup after backend truth audit confirms related upstream models

### 7. Messaging / Inbox / Threads
**Classification:** Repair

**Why:**
- the shared thread-summary direction appears valid
- however, the presence of a broken leftover `nextThreads` block shows quality/control problems in this area
- the concept remains valuable and likely salvageable

**Implication:**
- preserve the messaging model
- clean and harden it under stricter discipline

### 8. Delivery Prep
**Classification:** Repair

**Why:**
- the backend snapshot cutover was structurally sound
- the auth/RLS nuance appears understandable rather than inherently wrong
- this seems like an internal operational workflow that can likely be stabilized without replacement

**Implication:**
- keep the backend snapshot direction
- verify auth behavior and operational correctness deliberately

### 9. Driver portal / truck loading
**Classification:** Repair

**Why:**
- the real failure was isolated to idempotency and was fixed properly with upsert semantics
- the domain model appears reasonable

**Implication:**
- preserve the workflow, continue normal hardening only

### 10. Portal estimate visibility and client response flow
**Classification:** Rebuild after estimate lifecycle is redefined

**Why:**
- portal behavior depends on the estimate lifecycle model
- if the estimate model changes, portal behavior must follow that truth rather than be patched first

**Implication:**
- do not finalize portal estimate UX before the office estimate workflow is rebuilt

### 11. PDF generation / storage artifacts
**Classification:** Audit first, then repair

**Why:**
- invoice PDF/download path remains untrusted
- the issue may span auth, function execution, storage, or data assumptions
- recent attempts demonstrated that this path requires disciplined diagnosis only

**Implication:**
- treat this as a contained production bug track, not a design surface

### 12. Company / auth / RLS model
**Classification:** Audit first

**Why:**
- too many workflows depend on correct scoping and auth
- invoice download issues strongly suggest that assumptions about auth state and function access are not fully trustworthy yet

**Implication:**
- no broad auth changes until the model is mapped clearly

## Keep candidates, provisional

These should be preserved unless the backend truth audit disproves them:

- domain split direction, Facility / Office / Logistics / Finance / Portal
- backend-shaped summary/read-model approach
- staged Check In direction
- additive migration discipline
- company scoping as a core design requirement

## Remove candidates, provisional

These should be removed once the replacement paths are proven:

- stale fallback paths
- duplicate hidden workflow routes
- frontend-only heuristics that stand in for canonical backend truth
- legacy assumptions around standard-clean service naming once canonical service truth is defined

## Recommended execution order from this classification

1. complete backend truth audit
2. define canonical service / approval / estimate / invoice models
3. repair invoice baseline reliability
4. rebuild estimates from the new business model
5. continue Check In stabilization under live verification
6. resume Jobs / messaging / delivery refinement only after truth boundaries are clear

## Working conclusion

The platform is not a full wipe-to-zero candidate yet.

It is a mixed system where:
- some domains are salvageable through repair
- some workflows must be rebuilt
- some critical areas are unsafe to touch further without backend truth audit first

That means the correct strategy remains controlled recovery and rebuild, not blind continuation and not total scorched-earth replacement.
