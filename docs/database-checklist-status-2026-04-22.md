# Database Checklist Status - 2026-04-22

## Purpose

Record the current truthful database status after the recent route/workflow cleanup stretch, with explicit separation between:

- applied and verified work
- applied but not fully runtime-verified work
- blocked verification work

This document is meant to reduce ambiguity about whether the remaining risk is schema rollout, live function presence, or end-to-end invocation proof.

## Summary

At this point, the primary database posture is:

- **Most planned additive schema/function work for the current workflow redesign has been applied live already**
- **Several newer RPC/database primitives were directly probed and verified live earlier**
- **The biggest remaining DB gap is runtime verification completeness**, especially for the estimate-batch cadence/send path
- **`db pull` replay safety is still broken**, but whole-schema remote capture is now available through `supabase db dump --linked --schema public`

## 1. Applied and verified live

These areas were previously implemented, migrated, and explicitly checked live:

### Jobs / summaries
- Jobs summary RPC migration applied live
- supporting indexes applied live
- direct RPC probing previously succeeded on the correct project

### Messaging / thread summaries
- thread summary RPC applied live
- direct RPC probing previously succeeded on the correct project

### Check-In / delivery prep backend reads
- check-in pending snapshot RPC applied live
- delivery prep snapshot RPC applied live
- check-in pending probe previously succeeded
- delivery prep probe hit an auth/RLS boundary rather than missing-function drift

### Services / pricing consolidation
- `rug_services` snapshot-field migration applied live:
  - `service_category`
  - `service_unit`
  - `requires_estimate`
- downstream reads were cut toward snapshot semantics

### Estimate review / grouping / detail primitives
- estimate status enum extension applied live
- estimate review group summary/detail/action migrations applied live
- grouped action RPC probes previously succeeded
- simplified review-summary RPC probe previously succeeded after trust-boundary cleanup

### Estimate send batch base model
- batch tables/linkage migrations applied live
- send-batch summary RPC applied live
- queue/batch helper cleanup/restriction migrations applied live
- helper boundary was verified as intentionally backend-only

## 2. Applied but not fully runtime-verified

These items are likely structurally correct and live, but do **not** yet have complete end-to-end invocation proof from the current credential context.

### `process-notification-cadence`
Status:
- deployed to correct project
- config/auth shape reviewed
- helper/database boundary cleaned up
- code path updated toward batch-owned estimate sending

Still missing:
- truthful live dry-run or real invocation from the intended scheduler/admin context

Why this matters:
- this is the main remaining gap between “schema/function exists” and “the whole estimate-batch runtime path is proven live end to end”

### Operational reminder trigger path
Status:
- frontend invoke path exists
- function config and auth guardrails are in place
- code-level tests pass

Still missing:
- live invocation proof in the correct authenticated/secret-backed context for the latest estimate-batch-aware runtime behavior

## 3. Blocked verification items

### End-to-end cadence invocation
Currently blocked because this session does not have:
- `PROCESS_NOTIFICATION_CADENCE_SECRET`, or
- a valid office/admin bearer JWT suitable for truthful manual invocation

### Full schema pull / remote diff confidence
`supabase db pull --linked --schema public --yes` is still not dependable here because the baseline snapshot is not replay-safe in the shadow database.

Known failure pattern:
- foreign key replay failure around `admin_audit_logs.company_id` referencing `public.companies`
- root cause confirmed again on 2026-04-26: `0001_initial.sql` explicitly declares itself non-executable context only

Working alternative:
- `supabase db dump --linked --schema public --file <path>` succeeds and produces a truthful remote schema snapshot
- documented in `docs/database-schema-dump-verification-2026-04-26.md`

Implication:
- use **migration history + targeted live probes + dump-based remote schema capture** as the current trustworthy truth sources

## 4. What is *not* currently the problem

The current DB risk is **not** mainly:
- forgotten local migrations
- unapplied recent DB changes from this latest UX cleanup stretch
- missing route-support schema changes for the current frontend work

The recent implementation stretch was mostly frontend/navigation/surface cleanup. The database side was already in the previously established migrated state.

## 5. Most important remaining database checklist item

If one DB item should be treated as the main remaining checklist gap, it is:

**Run and record a truthful live invocation of `process-notification-cadence` in the intended auth/secret context.**

That is the clearest remaining step needed to move the estimate-batch/cadence work from:
- applied and structurally verified

to:
- operationally proven live

## 6. Practical next DB-status categories

### Closed enough for now
- additive schema rollout for jobs/thread/check-in/estimate review/send-batch primitives
- typed app alignment for those database primitives
- helper-boundary hardening for backend-only batch helpers

### Open, but only because of verification ceiling
- cadence runtime end-to-end proof
- replay-safe `db pull` baseline repair

### Best truth sources right now
Use these in order:
1. remote migration history
2. targeted live RPC probes
3. dump-based remote schema capture (`supabase db dump --linked --schema public`)
4. deployed function/version evidence
5. documented verification ceiling where credentials are unavailable

Avoid overstating certainty from:
- failed shadow-db pull diffs
- stale ambient env files from the wrong project
- browser-style probes against intentionally backend-only helpers
