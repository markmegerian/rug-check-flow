# Facility Workflow Surface Review - 2026-04-21

## Scope

This review covers the current facility-facing surfaces and the related top-priority operational workflow for launch.

Current facility-related surfaces found in the app:
- Check-In (`src/pages/CheckIn.tsx`, `src/components/facility/CheckInLayout.tsx`)
- Pending queue / walk-in selector (`PendingRugsPanel`)
- Check-in form and service flow (`CheckInForm`, `CheckInServiceSelector`, `CheckInPhotoSection`)
- Rug search / rug detail lookup (`RugSearchDialog`, `RugDetailSheet`)
- Delivery Prep (`DeliveryPrepTab`)
- Invoice Generator (`InvoiceGeneratorPanel`)
- Production (`ProductionBoard`)

## First principle

Facility should not be treated as one giant mixed workspace.

The facility team does different jobs:
- intake / check-in
- find or inspect a rug
- prep rugs for delivery
- track production / readiness
- sometimes hand off to invoice creation or lookup workflows

Those should not all be mentally mixed together on one surface.

## Worker-intent model for facility

The facility domain should be judged by these worker intents:

### 1. Intake / Check-In
Purpose:
- start or continue intake quickly
- move a pending pickup rug into check-in
- add a walk-in drop-off
- record details, condition, photos, and services
- complete intake with minimal friction

This is the most important launch-critical facility workflow.

### 2. Find / Inspect Rug
Purpose:
- quickly search by rug number or client
- inspect details for a rug already in the system
- check status or confirm identity

This is supportive, but important.

### 3. Delivery Prep
Purpose:
- review rugs scheduled for delivery
- confirm what is ready
- organize outgoing rugs reliably

### 4. Production / Readiness
Purpose:
- understand what is in progress
- know what is ready / blocked
- support the facility team’s operational flow without becoming a reporting swamp

## Current judgment by surface

## 1. Check-In
### Current shape
- separate top-level page outside the general Facility workspace shell
- left-side pending / walk-in queue on desktop
- form on the right
- mobile toggles between pending and form
- includes search and rug detail access from the shell

### Judgment
**Keep, but continue simplifying.**

### Why
This is the clearest facility surface right now and it is already closest to a purpose-built worker flow.
The staged rebuild was directionally correct.

### Keep
- dedicated Check-In route
- pending pickup / walk-in entry split
- fast-intake emphasis
- separate rug lookup access
- standard-wash fast path

### Simplify further
- reduce any remaining conceptual noise in the form
- keep the common path extremely fast
- keep layout stable and calm
- avoid introducing estimate/invoice/history clutter into this page

### Rule
Check-In should stay a **focused intake surface**, not become a mixed operations dashboard.

## 2. Pending queue / walk-in entry
### Current shape
`PendingRugsPanel` currently combines:
- pending rug queue
- queue filter
- walk-in client search
- walk-in rug add flow

### Judgment
**Keep, but treat as part of Check-In, not as its own broader workspace concept.**

### Why
For intake, this combination is acceptable because it supports one immediate job: selecting what to check in next.

### Caveat
If walk-in volume or client search complexity grows, the walk-in flow may later deserve a cleaner dedicated intake-start pattern.
For now it is acceptable if it stays fast and simple.

## 3. Rug search / rug detail
### Current shape
- search dialog accessible from shell
- detail sheet accessible from search or direct selection

### Judgment
**Keep as support utilities.**

### Why
These are cross-cutting operational tools, not full workflow pages.
They help workers inspect and verify without bloating the main flow.

### Rule
Do not turn these into a replacement for proper workflow surfaces.
They should stay lightweight and fast.

## 4. Delivery Prep
### Current shape
- facility workspace panel with date-based selection
- rug list and delivery confirmation behavior
- mixed operational readiness / list management behavior

### Judgment
**Keep, but probably simplify.**

### Why
This is a real operational need, but it should remain narrowly about outgoing delivery preparation.

### Watch-outs
- do not let it become another all-record browser
- prioritize ready/blocked clarity over dense metadata
- keep route/day selection operationally obvious

## 5. Production
### Current shape
- facility production board
- intended to reflect readiness / in-progress state

### Judgment
**Keep under review. Likely keep but simplify hard.**

### Why
Production state is important, but boards like this often become clutter magnets.
The question is whether it truly helps the facility team do the next action or just exposes system state.

### Review question
Should Production remain its own board, or should the most important readiness information be folded into a simpler facility work queue?

This needs a deeper page-specific review later.

## 6. Invoice Generator inside Facility
### Current shape
- facility workspace includes `InvoiceGeneratorPanel`
- search client
- load ready rugs
- exclude already invoiced rugs
- select rugs and generate invoice

### Judgment
**Keep the workflow idea, but likely move the product framing.**

### Why
The workflow itself is correct and practical:
- search client
- show invoice-eligible rugs
- hide already invoiced rugs
- select rugs
- create invoice

That is good.

But conceptually this is not really a general facility workspace page. It is a dedicated **Create Invoice** workflow.

### Better target
This should eventually be framed as:
- **Create Invoice**
not a generic invoice panel living beside unrelated facility tools.

Whether it lives under Facility, Office, or Finance should be decided by actual staff ownership, but the flow itself should remain purpose-built and search-first.

## Launch-priority decisions

### Must keep and refine now
- Check-In
- intake queue / walk-in selector
- rug search / rug detail support

### Keep, but review after core intake is locked
- Delivery Prep
- Production

### Keep the workflow, but reframe later
- Invoice Generator as a dedicated create-invoice surface rather than a mixed panel

## What facility should NOT become

Facility should not become:
- a dumping ground for every rug-related page
- a giant workspace mixing intake, history, delivery, invoicing, and reporting all together
- a dashboard that forces workers to visually parse everything at once

## Current design direction

For launch-priority work, Facility should be organized around the most important worker jobs:

1. **Check-In / Intake**
2. **Production / Ready state**
3. **Delivery Prep**
4. **Search / inspect support utilities**

Any billing/invoice workflow that remains in this domain should behave like a dedicated creation flow, not a giant invoice management page.

## Preliminary keep / simplify / split / merge / remove summary

- **Check-In page** → Keep, simplify
- **Pending queue + walk-in entry** → Keep as part of Check-In
- **Rug search dialog** → Keep
- **Rug detail sheet** → Keep
- **Delivery Prep** → Keep, simplify
- **Production board** → Keep under review, likely simplify
- **Invoice Generator panel** → Keep workflow, reframe as dedicated Create Invoice surface later

## Next follow-up for facility review

The next deeper facility review should answer:
- Is Production truly helping the next worker action, or just exposing state?
- Should Delivery Prep remain its own page or be narrowed further?
- Where should Create Invoice ultimately live organizationally?
- What remaining elements in Check-In are still concept-heavy and slowing workers down?
