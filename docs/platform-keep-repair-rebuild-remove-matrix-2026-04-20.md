# Platform Keep / Repair / Rebuild / Remove Matrix - 2026-04-20

## Purpose

This matrix exists to force explicit classification of platform subsystems instead of vague feelings like "messy" or "bad".

Every major subsystem should land in one of five buckets:

- **Keep**
- **Repair**
- **Rebuild**
- **Remove**
- **Unknown / Audit first**

## Decision rules

### Keep
Use when:

- the concept is clear
- the data model is trustworthy
- behavior is correct or close to correct
- the implementation is maintainable enough to keep

### Repair
Use when:

- the underlying model is still valid
- the workflow is worth preserving
- targeted corrections can restore trust

### Rebuild
Use when:

- the workflow is too confusing or fragile to trust
- the UI or orchestration is too compromised to salvage safely
- a fresh implementation against the same backend truth is lower-risk than continued patching

### Remove
Use when:

- the subsystem is dead
- duplicated
- misleading
- or actively harmful to clarity

### Unknown / Audit first
Use when:

- current trust is too low to classify responsibly
- backend semantics are unclear
- multiple hidden paths may be affecting behavior

## Applied matrix

## Keep

These are still provisional and must survive the backend truth audit, but current evidence says preserve them:

- company scoping as a core platform requirement
- route/domain split direction
- additive RPC/read-model strategy
- staged Check In direction

## Repair

- Check In, with live verification and no further broad redesign unless new evidence demands it
- Jobs summary/data flow
- messaging/thread surfaces
- Delivery Prep
- driver portal truck-loading workflow

## Rebuild

- estimates workflow and office review/send experience
- portal estimate visibility and response flow, after estimate lifecycle is redefined
- any major operational surface proven to be compensating for undefined backend truth instead of reflecting it

## Remove

- stale fallback paths after verified cutovers
- duplicate hidden workflow routes
- frontend-only heuristics that should be replaced by canonical backend truth
- dead/duplicative status or pricing logic once the canonical model is established

## Audit first

- services / pricing / approval model
- invoices workflow and invoice artifact reliability
- payments / credits
- PDF generation / storage artifact path
- company / auth / RLS model
- communication_events ownership boundaries where they affect operational decisions

## Required output after audit

For each subsystem below, assign one bucket and justify it in one sentence:

- Check In
- Services / pricing / approvals
- Estimates
- Invoices
- Payments / credits
- Jobs
- Messaging / inbox / threads
- Delivery prep
- Driver portal / truck loading
- Portal estimate/invoice visibility
- PDF generation / storage artifacts
- Company/auth/RLS model

This matrix should become the basis for sequencing the recovery and rebuild plan.
