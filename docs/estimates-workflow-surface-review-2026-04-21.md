# Estimates Workflow Surface Review - 2026-04-21

## Scope

This review covers the current Estimates surface in `src/components/office/EstimatesTab.tsx` and evaluates whether it matches the intended worker workflow for launch.

## Current shape

The current Estimates page is trying to do all of the following at once:
- create new estimates from rugs
- display grouped review units
- handle group-level ready/queue/expire actions
- show backend-owned review groups
- load detail rows on demand
- show estimate rows across many statuses
- expose client-approved and client-rejected context
- show batch-send visibility and batch controls
- act as both operational queue and historical management surface

This is exactly the type of all-in-one surface that is creating worker confusion.

## First judgment

The current Estimates page is not functionally clean from a worker point of view.
The user-facing concern is correct:
- strange estimate identifiers are not good primary anchors
- grouped review mixed with sent/rejected/expired sections creates a fragmented experience
- the page is too system-shaped and not action-shaped

## Worker-intent model for Estimates

Estimates should be separated by what a worker is actually trying to do.

## 1. Estimate Attention
Purpose:
- see everything estimate-related that needs attention now
- post-check-in review
- post-wash review
- rejection follow-up
- revision requests
- blocked or exception cases
- possibly ready-to-send items awaiting final human action

This page should answer:
- what needs attention now?
- why?
- what action is next?

This should be the primary operational queue.

## 2. Estimate Management
Purpose:
- search by client
- pull up all rugs for that client
- see associated estimates
- review current and past statuses
- inspect send/review/rejection history
- understand the client’s full estimate context cleanly

This page should answer:
- what is going on for this client?
- what happened historically?
- what estimates and rugs are tied together here?

## What should NOT happen

Estimate post-check-in review should not be lumped into the same giant page as general estimate history/management/search if that makes the page heavier and harder to work with.

That split is one of the clearest workflow decisions from this review.

## Operational identity rule

Workers should not be forced to rely on awkward generated estimate strings as the primary visible identifier.

Primary identity should usually be built from:
- client/company name
- rug number(s)
- rug count
- meaningful action/status context

Estimate number should remain available as a secondary reference, not the main operational anchor.

## Current judgment by function

## 1. Create estimate flow inside the page
### Judgment
**Keep capability, but do not let it define the whole surface.**

### Why
Creating an estimate is a valid action, but it should not force the entire page to also behave like a review queue and historical browser.

## 2. Grouped review units
### Judgment
**Keep the grouping concept.**

### Why
Grouping by client/company is the right operational direction.
This is much better than treating estimate rows as isolated items.

### Caveat
The grouped review model belongs in **Estimate Attention**, not mixed indiscriminately with historical/archive sections.

## 3. Sent / approved / rejected / expired sections on the same page
### Judgment
**Do not keep as primary sections on the same main operational surface.**

### Why
These are management/history concerns more than active queue concerns.
Their presence on the same primary screen creates exactly the “messy and confusing” experience the user described.

## 4. Batch-send visibility and controls
### Judgment
**Keep the functionality, but attach it to the attention/review workflow carefully.**

### Why
Batch send state is real operational context.
But it should not overwhelm the worker or turn the page into a scheduler control center.

This should likely live with the attention/review workflow or a small office-send queue concept, not as a large secondary dashboard competing with review work.

## 5. Single all-purpose Estimates page
### Judgment
**Do not keep as the long-term model.**

### Why
This is the clearest case so far of a surface trying to be queue + review + history + search + send control + creation all in one place.
That is the wrong product shape.

## Better target model

### A. Estimate Attention
A dedicated queue-oriented surface for:
- needs office review
- needs revision
- rejected / client decision follow-up
- send-ready items requiring action
- other estimate exceptions

Primary identity should be client + rug context, not estimate code.

### B. Estimate Management
A search-first client-centered surface for:
- search by client name
- show all rugs under that client
- show associated estimates and statuses
- inspect estimate history, send history, and related details cleanly

This should feel like lookup/context/history, not a queue.

## Launch-priority judgment

### Keep and improve now
- backend grouping concept
- grouped operational actions
- client-centered grouping and detail loading

### Reorganize conceptually as soon as practical
- split attention from management
- demote archive/history statuses from the main action surface
- stop using raw estimate code as the main human-facing identifier

### Avoid
- one giant “Estimates” page trying to be everything
- mixing urgent review work with general historical browsing as equal peers

## Preliminary keep / simplify / split / merge / remove summary

- **Current grouped review model** → Keep
- **Client/company grouping** → Keep
- **Group actions (ready/queue/expire)** → Keep concept
- **Estimate creation capability** → Keep capability
- **Sent/rejected/expired as large co-equal sections on same page** → Demote / move to management context
- **Single all-purpose Estimates page** → Split into attention + management

## Current conclusion

Estimates should not continue as one monolithic page.
The correct design direction is:
- **Estimate Attention** for anything needing action now
- **Estimate Management** for client-centered search, context, and history

This is a core workflow decision, not a minor UI preference.
