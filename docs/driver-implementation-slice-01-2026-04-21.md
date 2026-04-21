# Driver Implementation Slice 01 - 2026-04-21

## Purpose

This document defines the first concrete implementation slice for the Driver Portal.

Unlike Jobs, Estimates, and Invoices, this is not a radical restructuring candidate.
The driver portal is already relatively purpose-built.
The main task is to protect that simplicity and make the workflow boundary clearer.

## Current code reality checked

Reviewed against:
- `src/components/driver/TruckLoadingView.tsx`
- `src/pages/StopPortal.tsx`
- `docs/driver-portal-workflow-surface-review-2026-04-21.md`

## Current driver responsibilities in code

### 1. Truck loading
Present through:
- active delivery list selection
- confirmed-for-delivery rug loading
- morning additions
- loaded-on-truck toggles
- truck finalization / checkout

### 2. Route execution
Present through adjacent driver surfaces in `StopPortal`, including:
- route list
- stop detail
- exception/dispute handling
- delivery confirmation flow

## Judgment after code review

The current driver portal is already much closer to the right product shape than the office surfaces.

That means the correct move is **not** to add more complexity.
The correct move is to:
- preserve the single-job nature of truck loading
- keep morning additions explicit and reliable
- make the loading vs route-execution distinction clearer in surface framing

## What should not change yet

This slice should **not**:
- redesign the full driver portal
- merge loading into a broader logistics dashboard
- add management/history browsing to the driver experience
- change the underlying add-to-truck / checkout behavior
- alter the idempotent morning-addition fix

## Smallest safe product move

The smallest professional move is a **framing and boundary clarification**.

## Slice 01 recommendation

### Step A. Make truck loading read explicitly as truck loading
The loading surface should clearly communicate:
- this is today's load workflow
- it is about preparing the truck
- it is separate from route execution

### Step B. Keep morning additions explicit
Morning additions should remain visible and intentional, never blended ambiguously into normal list items.

### Step C. Keep route execution separate in wording and hierarchy
If the page or surrounding shell mixes loading and route execution too casually, the UI should make the sequence clearer:
- load truck first
- then execute route

## Proposed target shape for Slice 01

### Primary identity
- Truck loading
- today's route cargo
- add-to-truck reliability
- finalize truck

### Secondary / separate identity
- route execution
- stop handling
- disputes/exceptions

## Explicit boundary for this slice

This slice is **not yet**:
- a driver route split rewrite
- a backend delivery workflow rewrite
- a route execution redesign

It is a small product-boundary correction only.

## Validation standard for this slice

If implemented, validate:
1. truck loading still works normally
2. morning additions still work idempotently
3. loaded toggles still work
4. finalization still works
5. the driver workflow reads more clearly as loading first, route execution second
6. no layout instability is introduced

## Recommendation

Implement Driver slice 01 as a careful wording and hierarchy pass only.
Do not broaden the portal.
Protect simplicity.
