# Jobs Workflow Surface Review - 2026-04-21

## Scope

This review covers the current Jobs surface in `src/components/office/JobsTab.tsx` and evaluates whether it matches the intended worker workflow for launch.

## Current shape

The current Jobs page is doing several things at once:
- showing grouped jobs by source type (`pickup` vs `walkin`)
- exposing search across client, date, route day, rug number, rug type, linked rug tag, and linked services
- allowing expansion/collapse of grouped jobs
- filtering each group by job condition (`all`, `estimate_open`, `uninvoiced`, `delivered`, `returns`, `attention`)
- editing and creating pickup request items
- editing group-level notes
- opening linked rug context
- mixing operational work tracking with item editing and exception handling

This is already more disciplined than some other surfaces, but it is still carrying too many different worker intents at once.

## First judgment

Jobs is important, but it is still trying to be both:
- a working action queue
- and a maintenance/editor surface

That split is where confusion will grow.

## Worker-intent model for Jobs

Jobs should be evaluated by the actual reasons a worker uses it.

### 1. Job Attention / Operations Queue
Purpose:
- see what jobs need attention now
- identify estimate-open work
- identify uninvoiced completed work
- identify delivered/return states that require follow-up
- identify exception cases

This page should answer:
- what needs action now?
- what type of action is needed?
- which client/job/rugs are involved?

### 2. Job Management / Lookup
Purpose:
- search by client
- inspect grouped job context
- review rug-level details
- review notes and item details
- edit item metadata when needed

This page should answer:
- what is the full job context for this client/request?
- what rugs/items are in it?
- what changed and what still needs work?

### 3. Job Editing / Maintenance
Purpose:
- create or edit pickup request items
- update metadata safely
- maintain request notes

This is a narrower maintenance function and should not dominate the operational queue.

## Current judgment by function

## 1. Grouped job list
### Judgment
**Keep, but refocus.**

### Why
Grouping by customer/date/request context is useful and much more operational than raw flat rows.

### What should change conceptually
The page should stop trying to show every condition equally.
Jobs should lean toward an **attention-first** model, where the most important work rises naturally.

## 2. Source split (`pickup` vs `walkin`)
### Judgment
**Keep for now.**

### Why
This reflects real intake origin and is probably operationally meaningful.

### Caveat
Only keep it if staff actually think this way while working the page.
If not, it may become internal-system framing rather than worker framing.

## 3. Job filters (`estimate_open`, `uninvoiced`, `delivered`, `returns`, `attention`)
### Judgment
**Keep the concepts, but likely reorganize them.**

### Why
These are useful attention buckets, but they currently behave like embedded filters inside a broad all-purpose screen.
That is better than nothing, but still mentally noisy.

### Better target
These should likely become either:
- primary queue modes on an attention page,
- or clearly elevated summary entry points,
not just secondary toggles inside a dense page.

## 4. Inline item editing / creation dialogs
### Judgment
**Keep capability, but demote it from the main jobs surface.**

### Why
Editing pickup request items is a maintenance task.
It matters, but it should not shape the whole page.

### Better target
Job editing should feel like a secondary maintenance function, not the main identity of Jobs.

## 5. Group notes editing
### Judgment
**Keep, but make it contextual.**

### Why
Notes are useful, but they should support job handling rather than become another competing sub-workflow.

## Core decision

Jobs should probably be split conceptually into:

### A. Jobs Attention
A worker-facing operational queue for:
- estimate-open work
- uninvoiced ready work
- return/follow-up work
- delivery/result exceptions
- anything else that truly needs action now

### B. Jobs Management
A search-and-context surface for:
- finding client jobs
- reviewing grouped request/rug context
- reading notes
- opening rugs
- performing maintenance edits when needed

This is the same product lesson seen in Estimates and Invoices:
**do not force one page to be queue + editor + history + catch-all search all at once.**

## What should remain visible as primary identity

Jobs should be identified primarily by meaningful operational context, such as:
- client name
- scheduled date
- route day where relevant
- rug count
- rug numbers
- current needed action

Raw internal identifiers or hidden system concepts should stay secondary.

## Launch-priority judgment

### Keep and improve now
- grouped job context
- searchability
- ability to open linked rug context
- attention-oriented filters/concepts

### Keep but reframe later
- create/edit dialogs
- maintenance editing behavior
- lower-priority archival conditions

### Likely direction
The eventual model should be:
- **Jobs Attention**
- **Jobs Management**

## Preliminary keep / simplify / split / merge / remove summary

- **Current grouped Jobs page** → Keep temporarily, but refocus
- **Search** → Keep
- **Grouped context model** → Keep
- **Attention filters** → Keep concept, likely elevate/reorganize
- **Inline maintenance editing** → Keep capability, demote from main identity
- **Single all-purpose Jobs page** → Likely split later into attention + management

## Current conclusion

Jobs is important and should stay high priority, but the current page is still doing too much at once.
The safest design direction is not to throw it out, but to progressively separate:
- work needing action now
- from full-context job lookup and maintenance
