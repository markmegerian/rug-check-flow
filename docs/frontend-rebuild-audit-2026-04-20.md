# Frontend Rebuild Audit, 2026-04-20

## Purpose

This audit is the starting point for a deliberate frontend rebuild plan. The goal is not to throw away the system blindly. The goal is to preserve the backend and working domain logic where possible, while replacing a frontend architecture that has become too difficult to reason about, too hard to tune, and too inconsistent in workflow clarity.

## Current high-level assessment

The app appears to have strong underlying business capability but weak frontend containment.

### What seems worth preserving
- Supabase data model and additive migration history
- Edge workflows for operational actions
- Backend read-model direction already started via RPCs/snapshots
- Company scoping / auth model
- Core business domains already present in code:
  - Facility
  - Office
  - Logistics / Driver
  - Finance
  - Portal

### What appears to be failing at the frontend level
- too many high-responsibility screens
- too much workflow logic embedded directly in UI components
- too much reactive state mixed with operational concerns
- route/domain split exists, but screen-level surfaces still feel dense and entangled
- hard to understand what each screen owns versus what it coordinates
- performance tuning is difficult because boundaries are weak
- UX clarity suffers when trying to optimize via local component changes

## Keep / discard / redesign

## Keep

### 1. Backend and operational model
Keep unless a separate backend audit proves otherwise:
- Supabase tables and relationships
- additive migrations and RPC direction
- edge functions for workflow actions
- auth and company-scoping model
- current route/domain intent

### 2. Domain separation concept
Keep the domain architecture direction:
- Facility
- Office
- Logistics
- Finance
- Portal

This is still the right mental model. The problem is not domain routing itself. The problem is the weight and ambiguity of the screens behind those routes.

### 3. Read-model strategy
Keep and deepen:
- backend-shaped summaries
- route-specific snapshots
- additive RPCs
- typed frontend bindings

This is more reliable and more scalable than browser-side aggregation.

## Discard or de-emphasize

### 1. Giant all-purpose operational screens
The app should move away from screens that try to be:
- editor
- dashboard
- queue
- detail panel
- workflow engine
all at the same time.

### 2. UI components that own too much workflow logic
Complex operational flows should not live as one huge interactive component with too many responsibilities.

### 3. Implicit workflow state hidden across UI trees
If a user cannot tell where they are in a process, the UI is doing too much behind the scenes.

### 4. Performance work that depends on endless memoization instead of structural boundaries
Memoization is useful, but it should not be the primary strategy for rescuing overloaded screens.

## Redesign

## Core frontend principles for the rebuild

### 1. One route, one job
Each route should have a very clear purpose.
Examples:
- Check In should be intake, not intake + catalog + photo studio + workflow debugger + summary board
- Driver stop view should be stop execution, not route planning plus stop administration

### 2. Workflow clarity beats feature density
Operational users need clear next actions more than feature-rich surfaces.

### 3. Heavy UI must be conditional and isolated
Examples:
- service catalogs
- pricing editors
- photo capture flows
- large detail panels
- estimate builders

These should mount only when needed.

### 4. Shared layouts should be lightweight
The route shell should coordinate, not compute.

### 5. Domain logic should move downward into dedicated modules or backend read/write paths, not upward into massive route components

## Proposed rebuild shape

## Facility

### Keep as separate routes
- `/facility/check-in`
- `/facility/production`
- `/facility/delivery-prep`
- `/facility/invoice-generator`

### Redesign guidance
- Check In becomes a guided intake surface, not a giant form
- Production stays board-oriented and should be optimized around queue clarity
- Delivery Prep should remain snapshot-driven
- Invoice generation should be client/job scoped, not overloaded with search complexity

## Office

### Keep as separate routes
- `/office/jobs`
- `/office/inbox`
- `/office/clients`
- `/office/invoices`
- `/office/estimates`
- `/office/pickups`
- `/office/routes`
- `/office/pricing`

### Redesign guidance
- Jobs should become the operational summary home
- Clients should separate list, detail, billing, and communication concerns more cleanly
- Invoices and estimates should behave like workflow workbenches, not dense tab piles
- Pricing should remain admin-like, but with clearer source-of-truth semantics

## Logistics

### Keep as separate routes
- `/logistics/routes`
- `/logistics/stops/:id`
- `/logistics/truck-loading`

### Redesign guidance
- driver tasks should optimize for sequence and confirmation, not back-office density
- truck loading should be explicit and idempotent by design

## Finance

### Keep focused
- collections
- billing health
- invoice status / aging

This domain should remain narrow and analytical.

## Portal

### Keep separate from internal operations
- messages
- pickups
- rugs
- invoices
- estimates
- pricing

### Redesign guidance
The portal should feel client-safe and narrow, not like a mirrored operations UI.

## Architectural recommendation

## Frontend should rebuild around three layers

### Layer 1. Route shells
Responsibilities:
- page-level framing
- route-specific data bootstrap
- permission gating
- lightweight status context

Should not own heavy workflow mechanics.

### Layer 2. Workflow surfaces
Responsibilities:
- one clear user job
- one state machine / flow
- one bounded data contract

Examples:
- Check In flow
- Invoice creation flow
- Estimate send flow
- Truck loading flow

### Layer 3. Domain data/actions
Responsibilities:
- query modules
- backend workflow callers
- local transformation helpers
- shared type-safe contracts

These should be easy to test independently of route UI.

## Rebuild order recommendation

### Phase 1. Define source-of-truth architecture
- write target route map
- define each route's single job
- define route-level data ownership
- define shared workflow patterns

### Phase 2. Rebuild the highest pain operational flows first
Recommended order:
1. Check In
2. Jobs / operational summary
3. Driver truck loading / stop execution
4. Invoice creation / invoice workflow
5. Clients and messaging workbench

### Phase 3. Rebuild support/admin surfaces
- pricing admin
- collections / finance tools
- admin oversight tabs

### Phase 4. Portal cleanup
- align portal around client-safe workflows only

## Immediate recommendation

Do not keep trying to perfect the current frontend shape.

Instead:
1. freeze speculative UI tuning
2. define the rebuilt frontend architecture in docs first
3. pick one high-pain workflow at a time
4. rebuild route-by-route on top of the current backend
5. remove old surfaces only after the replacement proves itself

## Final judgment

A full frontend reset is justified.

Not because every existing piece is bad, but because the current frontend architecture no longer provides strong enough boundaries for performance, clarity, or maintainability.

The right move is a **structured salvage-and-rebuild**:
- preserve backend/domain value
- rebuild the frontend with stricter route ownership and workflow isolation
- port back only what clearly earns its place
