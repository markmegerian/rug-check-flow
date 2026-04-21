# Jobs Implementation Slice 01 - 2026-04-21

## Purpose

This document turns the Jobs workflow review into the first concrete implementation slice.

The goal is not to split the full Jobs experience immediately.
The goal is to define the smallest safe next step without destabilizing the backend summary path or the currently useful grouped context model.

## Current code reality checked

Reviewed against:
- `src/components/office/JobsTab.tsx`
- `src/lib/jobs-view.ts`
- `src/lib/jobs-summary.ts`
- `docs/jobs-workflow-surface-review-2026-04-21.md`

## Current Jobs responsibilities in code

The current page is carrying three distinct responsibilities:

### 1. Attention / operational queue behavior
Present today through:
- job-level attention filters:
  - `estimate_open`
  - `uninvoiced`
  - `delivered`
  - `returns`
  - `attention`
- grouped counts per job
- visible rug-level state badges:
  - estimate requested / response state
  - invoice state
  - return / re-entry state
  - rug status

### 2. Management / lookup behavior
Present today through:
- source split: `pickup` vs `walkin`
- free-text search
- grouped client/date context
- grouped rug inspection
- linked rug open action
- job note visibility

### 3. Editing / maintenance behavior
Present today through:
- `Add rug`
- `Edit`
- `Remove`
- group note editing dialog
- pickup request item update / insert / delete logic

## Judgment after code review

The code matches the earlier product judgment closely:
- the grouped summary model is worth keeping
- the backend summary cutover was the right foundation
- the current screen is still too mixed to be the long-term product shape
- the editing/maintenance tools are currently too close to the page's top-level identity

## What should not change yet

To avoid destabilizing a working surface, this slice should **not** yet:
- split the Jobs route into two new pages immediately
- replace the backend summary loader
- remove grouped context
- remove maintenance capability
- rewrite the search model

## Smallest safe product move

The next safe move should be a **framing and hierarchy shift**, not a backend rewrite.

## Slice 01 recommendation

### Step A. Reframe the current Jobs page as attention-first
Change the page so its top identity communicates:
- this is primarily for work that needs action
- search and grouped context remain available
- editing exists, but is secondary

### Step B. Demote maintenance actions visually
Without removing them, reduce the visual dominance of:
- `Add rug`
- `Edit`
- `Remove`
- note editing

They should read as contextual maintenance actions, not the page's main purpose.

### Step C. Elevate the queue concepts
The current filter concepts are useful.
The next step should make them feel more like explicit attention modes rather than secondary per-group toggles hidden inside each job card.

That does **not** require a full route split yet.
It can begin with:
- stronger page copy
- better section labeling
- clearer emphasis on attention counts or active attention state

## Proposed target shape for Slice 01

The current single page remains in place, but with these product rules:

### Jobs page identity
- title/subtitle should read as an operational jobs queue with grouped context
- the most important question becomes: what needs action now?

### Search
- stays available
- still supports management/lookup use cases
- does not become the primary visual identity of the page

### Grouped job cards
- stay
- continue to hold the operational context together

### Attention filters
- stay
- should be treated as the beginning of future Jobs Attention modes

### Maintenance actions
- stay
- move farther down the visual hierarchy
- stop reading like equal peers to the page’s main operational purpose

## Explicit boundary for this slice

This slice is **not** yet:
- `Jobs Attention` route creation
- `Jobs Management` route creation
- a data model rewrite
- a backend RPC rewrite

It is the first product-boundary correction that prepares that split safely.

## Validation standard for this slice

If implemented, validate:
1. grouped jobs still load from backend summary normally
2. search still works
3. per-job filters still work
4. add/edit/remove and notes still work
5. the page reads more clearly as an attention-oriented surface
6. no layout instability is introduced

## Recommendation

Implement Jobs slice 01 as a careful UI hierarchy pass only:
- attention-first wording
- clearer action-needed framing
- demoted maintenance controls
- preserve all current capability

That is the smallest professional next step before any route split.
