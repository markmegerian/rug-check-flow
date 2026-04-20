# Performance Audit, 2026-04-20

## Scope

Full-stack audit of application-side and database-side performance risks in the current `rug-check-flow` codebase.

This document focuses on:
- browser payload and hot screens
- query shape and overfetching
- likely database bottlenecks
- missing indexes
- RLS/query-join amplification risks
- highest-leverage remediation order

## Executive summary

The slowdown appears to be real and increasingly structural, not just subjective.

The biggest issue is **operational aggregation happening in the browser instead of the database**.
As data volume grows, the app is:
- fetching too many rows
- fetching overly wide row shapes
- performing expensive joins and grouping client-side
- polling repeatedly on top of that load

The most likely combined root causes are:
1. `JobsTab` assembling a large cross-table operational view in the browser
2. `DeliveryPrepTab` loading broad client/rug sets and mutating list membership from the UI
3. repeated hot-table reads on `rugs`, `clients`, `message_threads`, `messages`, `pickup_requests`, and `pickup_request_items`
4. missing composite indexes for actual filter + sort patterns
5. RLS policies on messaging tables that add join cost without supporting indexes on the lookup path

## Evidence gathered

### Build and bundle

Production build completes successfully in about 7.8s locally.

Largest built assets:
- `vendor-supabase` about 173 KB
- `vendor-react` about 163 KB
- `CheckInLayout` about 120 KB
- `vendor-ui` about 98 KB
- `offline-queue` about 77 KB
- `index` about 77 KB
- `AdminPanel` about 71 KB
- `InvoicesTab` about 58 KB
- `StopPortal` about 40 KB
- `ClientsTab` about 38 KB
- `JobsTab` about 25 KB

Conclusion:
- bundle weight contributes to cold-load and tab-switch cost
- but **bundle size is not the primary reason the system is getting worse over time**
- the degrading behavior is more consistent with data/query growth than static asset growth

### Large source hotspots

Largest source files include:
- `src/components/office/JobsTab.tsx`
- `src/components/facility/RugDetailSheet.tsx`
- `src/components/office/DeliveriesTab.tsx`
- `src/components/office/InboxTab.tsx`
- `src/components/office/ClientsTab.tsx`
- `src/components/facility/CheckInForm.tsx`
- `src/components/facility/DeliveryPrepTab.tsx`
- `src/components/portal/PortalMessagesTab.tsx`

Conclusion:
- several high-traffic screens are doing too much work inside a single component
- `JobsTab` is the clearest high-risk operational hotspot

## Application-side findings

### 1. `JobsTab` is the highest-severity hotspot

`src/components/office/JobsTab.tsx`

Current behavior:
- fetches up to 500 `pickup_requests`
- then fetches related `pickup_request_items`
- then fetches rug inventory separately
- then performs parallel fetches for:
  - `rugs`
  - `rug_services`
  - `communication_events`
  - `invoice_items` + invoices
  - return events from `communication_events`
- then builds maps, groups, merges, sorts, filters, and derives job summaries in the browser

Why this is bad:
- many hot tables involved in a single page load
- broad row counts
- repeated O(n) scans over growing arrays
- client-side joins duplicate work that Postgres is better at
- every reload or revisit repeats the full assembly cost

Impact:
- likely a major source of sluggishness in office workflows
- likely increases memory use and main-thread work
- likely amplifies DB pressure because the browser is orchestrating multiple large reads

Recommendation:
- replace with a server-shaped view or RPC returning pre-joined job summaries and per-job item lists
- move filtering/sorting primitives into SQL where possible
- page results by date window or cursor, not flat 500-row fetches

### 2. `DeliveryPrepTab` overfetches and self-synthesizes operational state

`src/components/facility/DeliveryPrepTab.tsx`

Current behavior:
- loads all clients with route days
- loads all rugs in statuses `checked_in`, `in_production`, `ready`
- filters in the browser by selected route date/day
- finds or creates delivery lists client-side
- inserts missing delivery items client-side
- refetches delivery list items and filters again client-side

Why this is bad:
- pulls a broad undelivered-rugs working set even when viewing only one route day
- causes data growth to directly degrade the prep screen
- mixes operational orchestration and heavy list assembly in the UI

Recommendation:
- create backend RPC/view for `delivery_prep_snapshot(date)`
- return only selected-day clients, eligible rugs, list state, and confirmation state
- avoid full working-set fetches in the browser

### 3. Messaging loads thread rows with embedded messages

`src/components/office/InboxTab.tsx`
`src/components/portal/PortalMessagesTab.tsx`

Current behavior:
- fetches `message_threads` with nested `messages (...)`
- sorts messages client-side to derive preview and unread state
- separately loads full message list for selected thread
- also polls selected thread every 15s

Why this is bad:
- preview list should not load full nested message collections for many threads
- nested child reads plus RLS can become expensive as messages grow
- polling multiplies the cost

Recommendation:
- add thread summary materialization or a view with:
  - last visible message body
  - last message timestamp
  - message count
  - unread markers
- fetch thread summaries only for the list page
- fetch full messages only for the selected thread
- consider replacing polling with change subscriptions or slower/manual refresh for inactive views

### 4. Core lookup hooks still use broad queries

`src/hooks/useClients.ts`
- `useClients()` still does `select("*")`

`src/hooks/useRugs.ts`
- `useRugs()` fetches all rugs plus all services for all loaded rugs
- `useRugCountsByClient()` reads all `rugs.client_id` rows and counts in JS

Why this is bad:
- broad list hooks become implicit global hot paths
- unrelated UI can pay for fields it does not need
- counts and summaries are being computed in the browser instead of by SQL

Recommendation:
- split into explicit summary/detail hooks
- replace browser-side counts with grouped SQL or materialized summary views

### 5. Polling discipline needs tightening

Observed polling:
- inbox: every 15s
- portal messages: every 15s
- route stops: recurring refresh loop

Why this matters:
- with multiple users, tabs, and sessions, polling becomes multiplicative
- this can make both app and DB performance look progressively worse

Recommendation:
- only poll when the tab is visible and active
- slow polling when idle
- prefer targeted revalidation after writes
- use realtime selectively if it reduces whole-list refreshes

## Database-side findings

## 1. Missing composite indexes for real query patterns

The schema has several useful baseline indexes, but many hot UI query patterns are not well covered.

### Existing relevant indexes

Present indexes include:
- `clients(name)`
- `clients(company_id)`
- `rugs(client_id)`
- `rugs(status)`
- `rugs(company_id)`
- `pickup_requests(client_id)`
- `pickup_request_items(pickup_request_id)`
- `pickup_request_items(checked_in_rug_id)`
- `delivery_list_items(delivery_list_id)`
- `delivery_list_items(rug_id)`
- `delivery_lists(status)`
- `communication_events(client_id)`
- route stop indexes on date, driver/date, client/date, and stop id
- unique active-thread identity index on `message_threads`

### Missing or likely-needed indexes

#### Messaging
Current query and RLS patterns strongly suggest these are needed:
- `messages(thread_id, created_at)`
- `message_threads(client_id, updated_at desc)`
- `message_threads(status, updated_at desc)` or a partial active-thread variant
- `portal_users(client_id, status)` and possibly `lower(email), status` if not already effectively covered for auth joins

Reason:
- thread lists order by `updated_at`
- message fetches order by `created_at` within `thread_id`
- RLS policies repeatedly join `messages -> message_threads -> clients` and `message_threads -> portal_users`

#### Delivery prep
Likely needed:
- `delivery_lists(route_day, target_date)` or `(target_date, route_day)`
- `delivery_list_items(delivery_list_id, rug_id)` unique or indexed if not already uniquely constrained
- `rugs(client_id, status)`
- potentially `clients(route_day)` if that filter is common and row count is nontrivial

Reason:
- selected-day prep workflows depend on route-day + target-date and client/status filtering

#### Jobs workflow
Likely needed:
- `pickup_requests(scheduled_date desc)` or `(client_id, scheduled_date desc)` depending on intended access path
- `communication_events(rug_id, created_at desc)`
- `invoice_items(rug_id)` if invoice lookup by rug is a hot path
- `rugs(client_id, checked_in_at desc)` and/or `rugs(client_id, intake_date desc)` depending on actual jobs view semantics

Reason:
- current jobs workflow scans by request recency and rug-linked event/invoice lookups

## 2. RLS likely amplifies cost on messaging tables

Messaging RLS policies perform existence checks joining:
- `message_threads -> clients`
- `messages -> message_threads -> clients`
- `message_threads -> portal_users`
- `messages -> message_threads -> portal_users`

This is correct for safety, but expensive when the app also asks for nested thread+message payloads.

Risk:
- thread list queries can become disproportionately costly under message growth
- every nested row can trigger additional filtered checks in plans

Recommendation:
- add supporting indexes for the join path
- stop using nested `messages (...)` in thread list queries
- consider denormalized thread summary fields if acceptable

## 3. Hot-table broad reads are likely degrading over time

Most likely hot tables:
- `rugs`
- `clients`
- `pickup_requests`
- `pickup_request_items`
- `message_threads`
- `messages`
- `communication_events`
- `delivery_list_items`

These are repeatedly touched by the most operationally important screens.

The current app often reads broad slices and reshapes them in code, which means row growth turns directly into user-visible slowdown.

## 4. There is not enough backend-owned summary shaping yet

The codebase has moved important write workflows into backend-owned edge functions, which is good.

But the read side still leans heavily on raw table access from the browser for critical operational pages.

That is now the main architectural performance gap.

## Highest-priority remediation order

### Priority 1, Jobs view backend refactor
Create a DB view or RPC that returns:
- job header summary
- status counts
- latest estimate response
- invoice linkage summary
- latest return state
- compact item rows

Goal:
- one server-shaped payload instead of many client-side joins

### Priority 2, Messaging summary refactor
Create either:
- `message_thread_summaries` view, or
- summary columns maintained on `message_threads`

Include:
- last visible message body
- last visible message timestamp
- visible message count
- unread hints / last sender

Also add indexes:
- `messages(thread_id, created_at)`
- `message_threads(client_id, updated_at desc)`

### Priority 3, Delivery Prep backend snapshot
Add RPC/view for route-date prep payload.

Also add indexes:
- `delivery_lists(target_date, route_day)`
- `rugs(client_id, status)`

### Priority 4, replace broad hooks
- split `useClients()` into summary/detail variants
- replace `useRugCountsByClient()` with SQL aggregate
- keep `useRugs()` away from all-rugs + all-services list usage except where explicitly necessary

### Priority 5, poll less and revalidate smarter
- only poll active visible screens
- slow down list polling
- fetch details only when expanded/selected

## Concrete candidate indexes to add first

These are the strongest first-pass candidates based on current code paths.

```sql
create index if not exists idx_messages_thread_created_at
  on public.messages (thread_id, created_at);

create index if not exists idx_message_threads_client_updated_at
  on public.message_threads (client_id, updated_at desc);

create index if not exists idx_delivery_lists_target_date_route_day
  on public.delivery_lists (target_date, route_day);

create index if not exists idx_rugs_client_status
  on public.rugs (client_id, status);

create index if not exists idx_communication_events_rug_created_at
  on public.communication_events (rug_id, created_at desc);

create index if not exists idx_invoice_items_rug_id
  on public.invoice_items (rug_id);

create index if not exists idx_pickup_requests_scheduled_date
  on public.pickup_requests (scheduled_date desc);
```

## What to measure next in production or staging

To turn this from high-confidence audit into hard proof, gather:
- Supabase query insights / slow query logs for hot tables
- row counts for hot tables
- explain analyze on:
  - jobs view equivalent queries
  - inbox thread list query
  - portal message thread query
  - delivery prep selected-day query
- client timings for first load of:
  - Jobs tab
  - Delivery Prep tab
  - Inbox tab
  - Clients tab

## Recommendation

Do **not** start with cosmetic frontend optimizations.

Start here:
1. add the candidate indexes above
2. move `JobsTab` to a backend-shaped read model
3. move messaging list pages to thread summaries instead of nested messages
4. move Delivery Prep to a backend snapshot payload

That order should produce the biggest practical improvement fastest.
