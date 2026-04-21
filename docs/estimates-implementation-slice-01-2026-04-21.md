# Estimates Implementation Slice 01 - 2026-04-21

## Purpose

This document defines the first concrete implementation slice for Estimates after reviewing the current page and backend grouping model.

The goal is to make the Estimates experience less confusing **without** destabilizing:
- backend-owned review groups
- grouped group actions
- grouped detail loading
- estimate send batch visibility
- current estimate creation capability

## Current code reality checked

Reviewed against:
- `src/components/office/EstimatesTab.tsx`
- `src/lib/estimate-review-groups.ts`
- `src/lib/estimate-group-details.ts`
- `src/lib/estimate-group-actions.ts`
- `src/lib/estimate-send-batches.ts`
- `docs/estimates-workflow-surface-review-2026-04-21.md`

## Current page responsibilities in code

The current page combines at least five separate worker intents:

### 1. Estimate creation
Present through:
- rug selector
- create estimate action
- revise estimate action in some states

### 2. Estimate attention / review queue
Present through:
- backend review groups
- group headers
- review counts
- ready-to-send counts
- grouped ready / queue / expire actions
- on-demand backend group detail loading

### 3. Estimate send queue visibility
Present through:
- `Estimate send batches` section
- cancel/requeue batch controls
- queue state visibility

### 4. Estimate history / management
Present through:
- direct estimate row listing
- many statuses on one page
- client decision visibility
- sent/approved/rejected/expired review in the same surface

### 5. Detailed estimate inspection
Present through:
- rug-linked rows
- client and rug context
- secondary estimate-level metadata

## Judgment after code review

The current page matches the earlier product concern exactly:
- the grouped backend review model is good and should be preserved
- the page is still too system-shaped
- active review work is mixed with archive/history context
- estimate creation is useful but should not dominate the operational surface
- send-batch visibility is useful but should not compete equally with review work

## What should not change yet

To avoid destabilizing a working backend-aligned slice, this implementation step should **not** yet:
- split the route into two new pages immediately
- change the backend RPC/group primitives
- remove send-batch visibility entirely
- remove estimate creation capability
- rewrite the estimate data model
- remove detail loading or grouped actions

## Smallest safe product move

The smallest professional move is a **hierarchy correction**.

The page should begin reading as an **Estimate Attention** surface first, while still temporarily retaining management/history capability until a dedicated management surface exists.

## Slice 01 recommendation

### Step A. Reframe the page as Estimate Attention
The title, page copy, and section order should make it clear that this surface is primarily for:
- needs office review
- needs revision
- ready-to-send review work
- grouped client estimate action
- send queue follow-through

### Step B. Keep creation, but demote it
The estimate creation affordance should remain available, but should no longer read as the page's core identity.

### Step C. Keep grouped review as the primary surface
Backend-owned grouped review units should remain the top operational element.
Those are the strongest foundation already in place.

### Step D. Demote historical/archive concerns
Statuses like:
- sent
- approved
- rejected
- expired
should stop reading like co-equal primary surface sections.

They may remain visible temporarily, but their hierarchy should be clearly secondary to active attention work.

### Step E. Keep send-batch visibility, but as supporting queue context
The `Estimate send batches` area is valid, but it should be framed as follow-through/supporting queue state rather than a competing main dashboard.

## Proposed target shape for Slice 01

The current page remains one page for now, but with these product rules:

### Primary identity
- Estimate Attention
- grouped client/company review first
- active work first

### Secondary support
- create estimate
- send batch visibility
- history/status visibility

### Temporary transitional allowance
Until a dedicated Estimate Management surface exists, the page may still contain management/history context, but it should be visibly secondary.

## Explicit boundary for this slice

This slice is **not yet**:
- `Estimate Attention` route creation
- `Estimate Management` route creation
- backend review-group rewrite
- send-batch model rewrite
- full archive/history extraction

It is the first hierarchy correction that prepares that later split safely.

## Validation standard for this slice

If implemented, validate:
1. review groups still load correctly
2. backend-owned group headers still render correctly
3. group detail loading still works
4. grouped ready/queue/expire still work
5. batch summary visibility still works
6. create estimate still works
7. the page reads more clearly as an attention-oriented operational surface
8. no layout instability is introduced

## Recommendation

Implement Estimates slice 01 as a careful hierarchy pass only:
- attention-first title/copy
- grouped review first
- creation demoted but retained
- batch queue framed as supporting operational follow-through
- history/archive context visually secondary

That is the smallest safe and professional next step.
