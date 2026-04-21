# Estimate Batch Helper Cleanup Slice 01 - 2026-04-21

## Purpose

This document records the next safe cleanup pass for the estimate send-batch helper path centered on `public.ensure_estimate_send_batch(...)`.

## Current state verified

### Browser/client path
Browser-side grouped queueing no longer uses direct batch creation.
`src/lib/estimate-group-actions.ts` now queues only through backend-owned RPC:
- `queue_estimate_group_batch(uuid[])`

This is the correct safer browser path.

### Backend/runtime path
`public.ensure_estimate_send_batch(...)` is still actively used by backend-owned logic:
- `supabase/functions/process-notification-cadence/index.ts`
- `supabase/migrations/20260421073000_add_estimate_send_batch_action_functions.sql`
  - `requeue_estimate_send_batch(uuid)`

So the helper is still part of the real backend model.

## Problem

The helper path drifted into an ambiguous state:
- originally written as a direct invoker function over `estimate_send_batches`
- later wrapped through `ensure_estimate_send_batch_internal(...)`
- attempted browser/authenticated usage ran into RLS and function-permission boundary failures
- browser queueing was then correctly rolled back to backend primitive use only

The remaining problem is not that the helper exists.
The problem is that its intended boundary became unclear.

## Judgment

The correct cleanup is:
- **keep the helper for backend-owned/server-side batch reuse**, because backend cadence processing and batch requeue primitives still depend on it
- **stop treating it as a browser-capable application primitive**
- simplify/clarify docs and typing so future work does not try to use it from browser code again

## Slice 01 recommendation

### 1. Keep backend helper in place
Do not remove `ensure_estimate_send_batch(...)` yet.
It is still used by:
- batch send processing
- batch requeue actions

### 2. Clarify boundary in app code/docs
Record that:
- browser queueing must stay on `queue_estimate_group_batch(uuid[])`
- direct batch reuse helper is backend/internal infrastructure

### 3. Reduce future misuse surface
Narrow the app-facing integration layer so the helper does not read like a normal browser RPC intended for frontend use.

## Non-goals for this slice

This slice does **not**:
- rewrite cadence processing
- remove batch requeue behavior
- redesign batch tables
- weaken RLS/auth boundaries just to make direct browser helper calls work

## Validation standard

After this cleanup slice:
1. browser grouped queueing still uses backend queue primitive only
2. backend cadence processing still compiles and works against the helper
3. batch requeue helper path remains intact
4. build/tests stay green
5. the codebase more clearly communicates that `ensure_estimate_send_batch(...)` is backend/internal, not a frontend primitive

## Recommendation

Implement the smallest cleanup that makes the boundary explicit without destabilizing the batch model.
