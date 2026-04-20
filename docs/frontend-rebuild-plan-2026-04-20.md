# Frontend Rebuild Plan, 2026-04-20

## Objective

Replace the current frontend incrementally with a cleaner, workflow-oriented architecture while preserving backend capability and live data safety.

## Non-goals
- no backend rewrite unless separately justified
- no destructive schema reset as part of the frontend rebuild
- no big-bang replacement that risks operational continuity

## Phase 0. Define the rebuild contract
- [ ] Approve the new route architecture and screen ownership model
- [ ] Identify backend contracts that must stay stable during the rebuild
- [ ] Mark current screens as keep, replace, or retire
- [ ] Decide how old and new surfaces will coexist during migration

## Phase 1. Rebuild the most painful workflows first

### 1A. Check In
- [ ] Define the final guided intake product shape
- [ ] Strip Check In back to the smallest correct workflow
- [ ] Measure live interaction performance before and after
- [ ] Validate standard-clean path, custom-services path, and photo path
- [ ] Remove obsolete Check In fragments once replacement proves stable

### 1B. Jobs / operational summary
- [ ] Redefine Jobs as the operational home surface
- [ ] Separate read-focused summary from action-heavy drill-ins
- [ ] Remove any remaining browser-side aggregation and hot-path ambiguity

### 1C. Driver execution surfaces
- [ ] Rebuild truck loading for explicit idempotent execution
- [ ] Rebuild stop execution around sequence, proof, and exception handling
- [ ] Ensure mobile ergonomics and low-friction confirmation flows

### 1D. Invoice / estimate creation
- [ ] Rebuild invoice creation around a clearer client -> rugs -> confirmation workflow
- [ ] Rebuild estimate workflow around service review and send actions
- [ ] Preserve backend workflow correctness and PDF generation semantics

## Phase 2. Rebuild office workbench surfaces
- [ ] Split client list, client detail, billing summary, and activity/messaging more cleanly
- [ ] Simplify inbox/message workbench ownership and thread navigation
- [ ] Clarify pickups and route-building surfaces
- [ ] Rebuild pricing admin with explicit source-of-truth rules

## Phase 3. Rebuild support and admin surfaces
- [ ] Finance views for collections, aging, and billing health
- [ ] Admin oversight panels for users, roles, responses, data health, and returns
- [ ] Remove orphaned or low-value tabs/components that do not earn a place in the rebuilt app

## Phase 4. Portal cleanup
- [ ] Align portal around client-safe workflows only
- [ ] Remove any portal surfaces that feel like leaked internal operations UI
- [ ] Keep messaging, pickups, rugs, invoices, estimates, and pricing narrowly focused

## Migration safety rules
- [ ] Preserve live IDs, workflow history, and company scoping
- [ ] Prefer side-by-side route replacement over destructive edits
- [ ] Validate each rebuilt route with build/tests and live smoke checks
- [ ] Keep a running rollback path for each route migration

## Success criteria
- [ ] Core workflows are easier to understand at a glance
- [ ] Core workflows feel fast under real use, not just in test/build output
- [ ] Route ownership is obvious and maintainable
- [ ] Heavy UI is isolated behind explicit user intent
- [ ] The rebuilt frontend restores trust instead of requiring constant rescue work

## Recommended immediate next step
1. Confirm the rebuild docs as the new working direction.
2. Revisit Check In one more time, but now as the first route in the broader rebuild rather than a one-off rescue.
3. Then proceed to Jobs as the next highest-value internal operational surface.
