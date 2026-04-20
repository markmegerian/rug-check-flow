# Platform Architecture Reframe, 2026-04-20

## Why this document exists

The current platform is feeling slower partly because it is doing too much work, but also because it is shaped incorrectly.

Today, too much of the app is still mentally and technically organized like:
- one giant Operations workspace
- one giant Portal workspace
- a handful of oversized tabs underneath each

That structure was useful during early delivery, but it is now causing three problems at once:
1. performance problems
2. ownership and boundary problems
3. product complexity problems

This document proposes a domain-based reframe so the platform behaves more like a set of focused products instead of one large tabbed surface.

---

## Current shape

### Top-level routes now
- `/`
- `/checkin`
- `/ops`
- `/portal`
- `/driver`
- `/admin`

### Current `Operations` tabs
Floor / facility-facing:
- Production
- Delivery Prep
- Invoice Generator

Business / office-facing:
- Accounts Receivable
- Estimates
- Clients
- Jobs
- Inbox
- Deliveries
- Routes
- Proofs
- Pricing

### Current `Portal` tabs
- Rugs
- Pickups
- Estimates
- Invoices
- Messages
- Prices

---

## Core diagnosis

The issue is not just that there are many tabs.
The issue is that these tabs are not really siblings.

They have very different:
- user intent
- data shape
- refresh cadence
- database access patterns
- complexity levels
- ownership boundaries
- performance characteristics

Putting them under one umbrella encourages:
- shared broad hooks
- shared query patterns
- tab-level state leakage
- client-side orchestration
- oversized route surfaces
- accidental coupling between unrelated workflows

In short, `Operations` is currently a container for several different products that have outgrown being neighbors.

---

## Proposed target shape

## 1. Facility domain

**Purpose:** physical intake, production-floor work, delivery readiness, and facility-originating handoff actions.

### Screens
- Check-In
- Production Board
- Delivery Prep
- Invoice Generator
- Rug Search / Rug Detail

### Why these belong together
They share:
- facility staff users
- intake/production/delivery readiness workflow
- rug readiness state transitions
- operational need for fast search and low-friction item handling

### DB/read-model profile
Should prefer:
- rug/facility-oriented read models
- production queue summaries
- selected-day delivery prep snapshot
- lightweight detail fetches when a rug is opened

### Target routes
- `/facility/checkin`
- `/facility/production`
- `/facility/delivery-prep`
- `/facility/invoices`
- optional shared search overlays instead of embedded mega-surface state

---

## 2. Office / customer operations domain

**Purpose:** customer relationship handling, estimates, communication, and office-side coordination.

### Screens
- Clients
- Jobs
- Estimates
- Inbox
- optional Pricing lookup if it stays office-owned

### Why these belong together
They share:
- customer-service and office workflows
- client/job/estimate/thread context
- frequent need for navigation between customer record, estimate, and conversation

### DB/read-model profile
Should prefer:
- client summary lists
- job summary view/RPC
- estimate summary and detail views
- message thread summaries, not nested raw thread/message payloads

### Target routes
- `/office/clients`
- `/office/jobs`
- `/office/estimates`
- `/office/inbox`
- `/office/pricing` if retained here

---

## 3. Logistics domain

**Purpose:** route planning, delivery execution, proof, and driver operations.

### Screens
- Deliveries
- Routes
- Proofs
- Driver Stop Portal

### Why these belong together
They share:
- route-date and driver execution concepts
- stop/list/proof data
- operational timing and polling concerns distinct from office/facility flows

### DB/read-model profile
Should prefer:
- route-day snapshots
- stop summaries
- delivery proof aggregates
- driver-scoped stop windows

### Target routes
- `/logistics/deliveries`
- `/logistics/routes`
- `/logistics/proofs`
- `/driver/stops` or keep `/driver` as the execution entry point

---

## 4. Finance domain

**Purpose:** receivables, invoices, payments, credits, collections.

### Screens
- Accounts Receivable / Invoices
- Payments
- Credits
- Collections and aging workflows

### Why these belong together
They share:
- financial access patterns
- billing primitives
- slower-changing but highly structured data
- different permissions and risk profile than floor ops or messaging

### DB/read-model profile
Should prefer:
- invoice summary views
- balance/aging views
- payment allocation summaries
- collections action timelines

### Target routes
- `/finance/invoices`
- `/finance/payments`
- `/finance/credits`
- `/finance/collections`

---

## 5. Portal domain

The client portal can remain one top-level product, but it should still be treated as a set of thinner route modules instead of one persistent mounted tabbed workspace.

### Current issue
`WholesalePortal` keeps mounted tab state and behaves like a mini-application shell with hidden tab content.

### Better shape
- `/portal/rugs`
- `/portal/pickups`
- `/portal/estimates`
- `/portal/invoices`
- `/portal/messages`
- `/portal/prices`

### Why
This reduces:
- hidden mounted content
- shared tab-state complexity
- accidental cross-tab data persistence
- oversized route surface behavior

Portal can still visually look tabbed, but routing should be first-class.

---

## Architectural principles for the new shape

## Principle 1. Domain routes over mega-tabs
Use real routes as primary boundaries.

Reason:
- route-level code splitting becomes meaningful
- data loaders can be domain-specific
- polling can be domain-specific
- permissions can be domain-specific
- performance budgets become measurable by route

## Principle 2. Summary list vs detail fetch separation
Every domain should distinguish between:
- list/summary payloads
- detail payloads

Reason:
- avoids `select(*)` style creep
- reduces load on initial workspace views
- lets the browser fetch detail on open, not before

## Principle 3. Backend-shaped read models for operational screens
Critical operational surfaces should not assemble their own business objects in the browser.

Prefer:
- SQL views
- RPCs
- materialized summaries where justified

Especially for:
- Jobs
- Delivery Prep
- Inbox thread list
- Finance aging/collections views

## Principle 4. Polling only where the domain truly needs it
Different domains need different freshness.

Examples:
- driver stop execution: more frequent refresh acceptable
- inbox list: moderate refresh or realtime summary updates
- clients list: mostly manual refresh or cache-based refresh
- finance: low-frequency or event-driven refresh

## Principle 5. Role and ownership boundaries should follow domain boundaries
This improves both mental model and performance.

Examples:
- facility users should not pay for office or finance data on facility screens
- finance read models should not be mixed into generic ops hooks
- portal users should not share hidden mounted state with unrelated portal areas

## Principle 6. Layout stability is a system requirement
The UI should feel planted. State changes may change meaning, but they should not change geometry unless the user explicitly opened, closed, expanded, collapsed, or resized something.

This means:
- buttons, chips, tabs, cards, rows, filters, and headers should keep stable footprints
- loading state, empty state, and loaded state should preserve the same layout contract whenever possible
- async updates should not cause surrounding controls to jump
- skeletons should match the final layout they are standing in for
- drawers, dialogs, sheets, and panels should use predictable shell sizes
- changing text, counts, badges, or timestamps should not push neighboring UI around

Treat unexpected layout shift as a product bug, especially in:
- Facility workflows
- Jobs and Inbox
- Portal interactions
- Driver execution screens

### Practical rules for implementation
- reserve width for dynamic labels, counts, and badges
- use fixed-height action bars and filter bars
- keep button shells the same size across idle/loading/success/error states
- reserve helper/error text space where repeated validation changes would otherwise push fields
- prefer shape-matched skeletons over generic placeholders
- avoid mounting hidden content that later changes parent layout unexpectedly
- use explicit min-heights and min-widths for repeated operational components

### Review standard
Any UI change that introduces visible micro-shifts during load, polling, or mutation should be treated as a regression and fixed before rollout.

---

## Recommended target route map

## Internal
- `/facility/checkin`
- `/facility/production`
- `/facility/delivery-prep`
- `/facility/invoices`

- `/office/clients`
- `/office/jobs`
- `/office/estimates`
- `/office/inbox`
- `/office/pricing`

- `/logistics/deliveries`
- `/logistics/routes`
- `/logistics/proofs`
- `/driver`

- `/finance/invoices`
- `/finance/payments`
- `/finance/credits`
- `/finance/collections`

- `/admin`

## Portal
- `/portal/rugs`
- `/portal/pickups`
- `/portal/estimates`
- `/portal/invoices`
- `/portal/messages`
- `/portal/prices`

---

## What should stay shared

Not everything needs to split.

Keep shared:
- auth/session context
- app shell and sidebar primitives
- rug detail sheet/search overlays where truly cross-domain
- design system components
- low-level Supabase client helpers
- generic formatting and utility helpers

But do **not** keep broad domain data in global generic hooks unless multiple domains truly need the same exact summary shape.

---

## What should stop being shared

These are the main things that should stop acting global:
- giant `Operations` tab container as the primary internal workspace model
- broad all-clients/all-rugs hooks as default data access
- browser-owned job aggregation
- browser-owned delivery prep aggregation
- thread list queries that embed nested message lists
- hidden mounted portal tabs as the default route behavior

---

## Low-risk migration order

## Phase 1. Route reframe without major workflow rewrite

Goal:
- split navigation and route ownership first
- keep existing components mostly intact while rehoming them

### Steps
1. Introduce new route groups:
   - facility
   - office
   - logistics
   - finance
   - portal subroutes
2. Move existing screens behind those routes with minimal internal logic changes
3. Keep `/ops?tab=...` as a compatibility redirect layer for a while
4. Keep `/portal?tab=...` as a compatibility redirect layer for a while

### Wins
- immediate route-level isolation
- better code splitting
- clearer ownership
- lower risk than changing every read model first

## Phase 2. Replace the worst read models

Priority order:
1. Jobs read model
2. Inbox/message thread summary read model
3. Delivery Prep snapshot read model
4. finance summary views

### Wins
- biggest performance improvement
- removes browser-side aggregation hotspots

## Phase 3. Clean up hooks by domain

Examples:
- `useClientsSummary`
- `useClientDetail`
- `useJobsSummary`
- `useJobDetail`
- `useDeliveryPrepSnapshot(date)`
- `useThreadSummaries`
- `useThreadMessages(threadId)`
- `useFinanceAgingSummary`

### Wins
- query discipline
- smaller payloads
- easier caching and invalidation

## Phase 4. Polling and refresh discipline

- only active route polls
- hidden routes do not poll
- details refresh after mutation rather than on a blanket interval
- realtime selectively replaces some polling

## Phase 5. UI simplification and cross-domain navigation

After routes and read models stabilize:
- add deep links between domains
- “Open in client record”, “Open in job”, “Open in invoice”, “Open thread”
- use links instead of forced co-location under one mega-page

---

## Immediate practical recommendation

Do not jump straight into a massive rewrite.

The best sequence is:
1. **split route architecture first**
2. keep compatibility redirects from old tab URLs
3. then replace the heaviest backend read models one by one

That gives us:
- lower risk
- visible product simplification
- measurable performance wins
- less chance of optimizing an architecture we already know is wrong

---

## First concrete implementation slice

The best first slice is:

### Slice A, internal route split
- carve `Operations` into:
  - Facility workspace routes
  - Office workspace routes
  - Logistics workspace routes
  - Finance workspace routes
- keep existing components initially
- turn `/ops?tab=...` into redirects

### Slice B, portal route split
- carve `WholesalePortal` into true subroutes
- stop keeping all visited tabs mounted under one page shell
- use route navigation, not mounted hidden tab sections

### Slice C, first backend read-model replacement
- replace `JobsTab` data assembly with a server-shaped summary API/view

This is the best balance of architectural correction and immediate performance value.

---

## Recommendation

Yes, we should stop treating all tabs as one thing.

The platform has reached the point where:
- **Facility**
- **Office**
- **Logistics**
- **Finance**
- **Portal**

should be treated as distinct domains with separate route boundaries, separate read models, and separate performance budgets.

That is the cleanest path to both a faster system and a simpler product.
