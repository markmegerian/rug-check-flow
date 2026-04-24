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
  - [x] Remove legacy Jobs fallback once backend validation remains clean
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
  - [x] Memoize heavy Check In photo/service sections to cut unnecessary parent-driven rerenders
  - [x] Collapse heavy service-selection UI behind an explicit fast-intake toggle so the screen stays light by default
  - [x] Restructure Check In into a lighter multi-step fast-intake flow instead of one giant live form tree
  - [x] Implement the desired fast path: details/photos/condition first, then "Standard wash?" yes/no
  - [x] Wire the fast path to reuse the existing DB `Standard Wash` service through the current `check-in-workflow` path
  - [~] Profile and cut any remaining interaction lag in form editing and submission path
    - [x] Tighten walk-in client search affordances so the lightweight intake path gives clearer loading/empty states without extra UI jumpiness
    - [x] Replace the monolithic Check In form with a staged intake flow that isolates details, photos, cleaning decision, and custom services
    - [x] Keep the standard-clean path free of mounted custom-services UI unless the operator explicitly chooses additional services
- [ ] Remove broad `select(*)` hot-path reads where not required
- [~] Redesign estimate workflow for clean office review and grouped batch sending
  - [x] Define target operating model: Check In creates internal estimate work, Office owns review and explicit send
  - [x] Define client/company-grouped office review requirement so staff can process all estimate work for an account together
  - [x] Define end-of-day grouped send requirement so one client does not receive multiple estimate emails in one day
  - [x] Write formal redesign spec in `docs/estimate-workflow-redesign-2026-04-20.md`
  - [x] Inventory current estimate send/review touchpoints and portal dependencies for implementation cutover (`docs/estimate-cutover-audit-2026-04-24.md`)
  - [x] Define final DB/status migration strategy and rollback path (`docs/estimate-migration-strategy-2026-04-24.md`)
  - [ ] Rebuild office Estimates surface around grouped company review queue
  - [~] Rewrite estimate send path around grouped end-of-day client/company batch sends
    - [x] Stop Check In from pre-queueing estimate batch sends before office review
    - [x] Clean up stale unsent pre-queued estimate cadence rows during cutover
    - [x] Route single-estimate office queueing and status transitions through backend helpers instead of browser-owned writes
  - [x] Update portal/client estimate visibility and response flow to match the new lifecycle
    - [x] Route portal approve/reject transitions through the shared backend status helper while preserving client-response event logging
    - [x] Restrict portal estimate reads/history to client-facing states only via backend portal-estimate helper
- [~] Review services catalog, approval behavior, and pricing calculation rules end to end
  - [ ] Audit live services list for names, categories, active state, units, base/preferred/vip prices, sort order, and `requires_estimate`
  - [ ] Compare live catalog against frontend assumptions such as `Standard Wash` naming/category behavior
  - [x] Trace how service pricing is calculated across Check In, approvals/estimates, invoicing, and portal display
  - [ ] Define the canonical approval rule for standard cleaning so standard-clean-only rugs auto-approve reliably
  - [x] Document the source-of-truth pricing/approval model and patch mismatches safely

## Phase 3. Database performance hardening
- [ ] Add first-pass hot-path indexes
- [ ] Review query plans for Jobs, Inbox, Delivery Prep, Driver Stops
- [ ] Add any additional composite/partial indexes from plan results
- [ ] Evaluate view/RPC/materialization candidates for operational summaries

## Phase 3A. Data safety and migration discipline
- [x] Maintain additive-first migration strategy
- [ ] Verify no existing rug, estimate, invoice, pickup, or delivery relationships are changed unintentionally
- [x] Add side-by-side validation for any new read model before cutover
- [ ] Define rollback path for any migration that affects production data behavior
- [x] Capture pre/post validation notes for changes that touch live workflow data

## Phase 4. Polling and refresh discipline
- [ ] Restrict polling to active visible routes
- [ ] Replace blanket refresh loops with targeted revalidation where possible
- [ ] Review realtime vs polling per domain

## Phase 5. UI stability pass
- [~] Define implementation checklist for layout stability review
- [x] Stabilize shared action bars, headers, and filter rows
- [x] Stabilize loading/empty/error footprints on high-traffic screens
- [x] Stabilize button shells and dynamic badge/count spacing
- [~] Stabilize dialogs, sheets, and side panels
  - [x] Stabilize Check In photo and service surfaces with reserved space so heavy sections stop changing footprint during interaction
  - [x] Stabilize Rug Detail sheet width, header, and scroll body so the panel stops resizing and reflowing during load/state changes

## Phase 6. Verification and rollout
- [x] Build passes
- [x] Tests pass
- [ ] Critical route smoke coverage updated
- [x] Docs/status tracker updated
- [ ] Release plan for domain split prepared

---

## Current focus
- Platform reevaluation and backend truth audit from first principles
- Immediate next checks:
  - complete backend truth audit
  - classify subsystems into keep / repair / rebuild / remove
  - define canonical business model before further broad rebuild work

## Reevaluation reset documents
- `docs/platform-reevaluation-master-plan-2026-04-20.md`
- `docs/backend-truth-audit-checklist-2026-04-20.md`
- `docs/platform-keep-repair-rebuild-remove-matrix-2026-04-20.md`
