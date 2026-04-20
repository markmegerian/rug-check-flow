# Frontend Rebuild Architecture, 2026-04-20

## Goal

Rebuild the frontend so it is:
- fast
- understandable
- route-bounded
- workflow-oriented
- maintainable under real operational complexity

This architecture assumes the backend, database, auth model, and additive RPC/workflow direction are broadly preserved.

## Product principles

### 1. Routes should reflect real jobs
A route should exist because a user is trying to accomplish a specific job, not because a tab needed a place to live.

### 2. Workflows beat tab piles
When a user is trying to do work, prefer:
- queue -> detail -> action
or
- guided workflow
rather than giant switchable tab surfaces.

### 3. One surface should not try to be both dashboard and editor
Dashboards summarize.
Editors and workflows execute.
Keep these separate unless there is a very strong reason not to.

### 4. The common path gets the simplest surface
Rare cases should branch into advanced flows. Rare cases should not dictate the default UI complexity.

### 5. Heavy interactions must be isolated
Photo capture, service catalogs, large searchable lists, and multi-step workflow logic should not all live in one mounted tree if the common path does not need them.

## Proposed top-level route map

## Facility
- `/facility/check-in`
- `/facility/production`
- `/facility/delivery-prep`
- `/facility/invoice-generator`

## Office
- `/office/jobs`
- `/office/clients`
- `/office/client/:id`
- `/office/inbox`
- `/office/invoices`
- `/office/invoice/:id`
- `/office/estimates`
- `/office/pickups`
- `/office/routes`
- `/office/pricing`

## Logistics
- `/logistics/routes`
- `/logistics/route/:id`
- `/logistics/stop/:id`
- `/logistics/truck-loading`

## Finance
- `/finance/collections`
- `/finance/invoice-aging`
- `/finance/billing-health`

## Portal
- `/portal/home`
- `/portal/rugs`
- `/portal/rug/:id`
- `/portal/pickups`
- `/portal/messages`
- `/portal/invoices`
- `/portal/estimates`
- `/portal/pricing`

## Surface patterns

## Pattern A. Queue -> detail -> action
Use for:
- jobs
- clients
- pickups
- route stops
- production boards

Structure:
- left or top list of work
- focused detail pane
- explicit actions
- summary separate from execution

## Pattern B. Guided workflow
Use for:
- check in
- invoice creation
- estimate creation/sending
- truck loading confirmation

Structure:
- one current task
- one clear next step
- optional advanced branch
- lightweight summary

## Pattern C. Dashboard / board
Use for:
- production overview
- finance overview
- reminders / attention queues

Structure:
- read-focused first
- drill in from summary
- no dense editing if avoidable

## Component architecture

## Route Shell
Responsibilities:
- framing
- route-specific preload
- permission check
- narrow context provisioning

Should not:
- own deep workflow state
- contain large editing logic
- derive business-heavy data in render

## Workflow Surface
Responsibilities:
- the specific user task
- bounded local state machine
- explicit transitions
- specific submit/rollback logic

Should not:
- double as a dashboard
- keep unrelated heavy subtrees mounted

## Domain Data Layer
Responsibilities:
- backend reads and writes
- RPC wrappers
- shape conversion
- typed contracts
- caching rules

## View Fragments
Responsibilities:
- render-only or near-render-only concerns
- no hidden workflow ownership

## Shared UX rules

### 1. Always-visible context, not always-visible complexity
The user should always know:
- who/what they are working on
- where they are in the flow
- what the next action is

The user should not always see:
- full pricing complexity
- heavy advanced controls
- giant review sections

### 2. Layout stability is mandatory
- stable headers
- stable action bars
- reserved loading footprints
- no collapsing content that changes the page shape unexpectedly

### 3. Common path must feel calm
- no unnecessary scrolling
- no reactive noise
- no hidden work surfacing visually
- no duplicated success/failure messages

## Technical rules for the rebuild

### 1. Prefer backend-shaped read models for operational lists
### 2. Keep optimistic UI narrow and explicit
### 3. Use idempotent write flows for user-triggered operations
### 4. Lazy-load heavy UI only when a branch genuinely needs it
### 5. Measure hot workflows before deep optimization work

## First rebuild target

## Check In
Target shape:
- guided single-purpose intake workflow
- standard-clean path optimized as the dominant path
- custom services as a conditional branch
- photo handling isolated from text-entry path
- queue selection clearly separate from intake editing

## Migration philosophy

Do not replace the entire app in one cut.

Instead:
- rebuild one route/workflow at a time
- keep backend contracts stable where possible
- validate replacements before removing old surfaces
- preserve data integrity and operational continuity throughout

## Final recommendation

The frontend rebuild should be treated as a product architecture project, not just a code cleanup effort.

Success depends on:
- clearer route jobs
- fewer overloaded screens
- better workflow boundaries
- preserving backend value while aggressively simplifying frontend surfaces
