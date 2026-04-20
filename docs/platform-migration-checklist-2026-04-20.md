# Platform Migration Checklist, 2026-04-20

Status legend:
- [ ] not started
- [~] in progress
- [x] completed
- [!] blocked / needs decision

## Working rules
- Architecture changes should prefer route/domain separation over tab accretion.
- Performance changes should prefer backend-shaped read models over browser aggregation.
- UI changes must preserve layout stability and avoid micro-shifts.
- Live rug and workflow data are protected. Changes must preserve existing records, IDs, relationships, and workflow history.
- Prefer additive migrations, views, RPCs, redirects, and side-by-side verification over risky rewrites.
- No destructive schema/data changes without explicit review, rollback planning, and validation.
- Each meaningful implementation slice should update this checklist in the same change set.
- Commit means commit and push to GitHub unless explicitly stated otherwise.

---

## Phase 0. Audit and architecture definition
- [x] Document application/database performance audit
- [x] Document domain-based architecture reframe
- [x] Add layout stability as a system requirement

## Phase 1. Route/domain split foundation
- [x] Create tracked implementation checklist
- [x] Define target internal route map in app router
- [x] Add compatibility redirects from legacy `/ops?tab=` URLs
- [x] Add compatibility redirects from legacy `/portal?tab=` URLs
- [x] Split sidebar navigation by domain instead of giant workspace tab set
- [x] Create route shells for Facility, Office, Logistics, Finance
- [x] Move existing screens behind new routes with minimal behavior change

## Phase 2. Read-model cleanup
- [~] Replace Jobs browser aggregation with backend-shaped read model
  - [x] Extract current Jobs shaping into a shared read-model module to enable safe side-by-side validation and backend cutover
  - [x] Introduce additive backend Jobs summary RPC returning grouped job records plus item payloads
  - [x] Wire side-by-side validation of backend Jobs summary against current UI grouping before cutover
  - [x] Cut Jobs UI over to backend summary with guarded fallback to legacy path
  - [x] Add first-pass hot-path indexes supporting Jobs, Inbox, and Delivery query patterns
  - [ ] Remove legacy Jobs fallback once backend validation remains clean
- [~] Replace inbox/thread-list nested message loading with thread summaries
  - [x] Add additive backend thread summary RPC for office and portal thread lists
  - [x] Cut Inbox and Portal thread lists over to backend thread summaries
  - [ ] Validate thread-summary behavior under live messaging activity and remove any remaining nested thread-list reads
- [~] Replace Delivery Prep browser synthesis with selected-date backend snapshot
  - [x] Add additive backend snapshot RPC that owns selected-date delivery-list sync
  - [x] Cut Delivery Prep tab over from broad client/rug reads to backend snapshot payload
  - [ ] Validate live behavior for empty routes and route-day naming consistency, then remove any remaining browser-owned sync assumptions
- [ ] Split client hooks into summary/detail patterns
- [ ] Split rug hooks into summary/detail patterns
- [~] Improve Check In responsiveness on the live hot path
  - [x] Cut pending pickup queue loading from nested browser joins to backend snapshot RPC
  - [x] Reduce Check In form pricing recomputation churn by centralizing derived pricing state
  - [x] Reduce service selector rerender pressure by memoizing category groups and shared pricing lookups
  - [x] Simplify Check In UI by removing always-on cost displays and keeping custom-price entry only where needed
  - [x] Remove client lookup cache state churn and derive submit totals only at submit time
  - [x] Stop force-remounting Check In form when switching selected queue items
  - [ ] Profile and cut any remaining interaction lag in form editing and submission path
- [ ] Remove broad `select(*)` hot-path reads where not required

## Phase 3. Database performance hardening
- [ ] Add first-pass hot-path indexes
- [ ] Review query plans for Jobs, Inbox, Delivery Prep, Driver Stops
- [ ] Add any additional composite/partial indexes from plan results
- [ ] Evaluate view/RPC/materialization candidates for operational summaries

## Phase 3A. Data safety and migration discipline
- [ ] Maintain additive-first migration strategy
- [ ] Verify no existing rug, estimate, invoice, pickup, or delivery relationships are changed unintentionally
- [ ] Add side-by-side validation for any new read model before cutover
- [ ] Define rollback path for any migration that affects production data behavior
- [ ] Capture pre/post validation notes for changes that touch live workflow data

## Phase 4. Polling and refresh discipline
- [ ] Restrict polling to active visible routes
- [ ] Replace blanket refresh loops with targeted revalidation where possible
- [ ] Review realtime vs polling per domain

## Phase 5. UI stability pass
- [ ] Define implementation checklist for layout stability review
- [ ] Stabilize shared action bars, headers, and filter rows
- [ ] Stabilize loading/empty/error footprints on high-traffic screens
- [ ] Stabilize button shells and dynamic badge/count spacing
- [ ] Stabilize dialogs, sheets, and side panels

## Phase 6. Verification and rollout
- [x] Build passes
- [x] Tests pass
- [ ] Critical route smoke coverage updated
- [ ] Docs/status tracker updated
- [ ] Release plan for domain split prepared

---

## Current focus
- Phase 2 read-model cleanup and Check In responsiveness
- Tonight's priority: make live Check In feel materially faster and less painful to use
