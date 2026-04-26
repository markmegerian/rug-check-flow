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
- **The scheduler-mode cadence runtime path is now proven live** via scheduled secret-backed invocation; the remaining uncertainty is narrower and mostly about outbound delivery posture rather than runtime execution
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
- truthful live scheduler invocation now documented on 2026-04-26 in `docs/process-notification-cadence-live-verification-2026-04-26.md`

Observed live result:
- scheduled GitHub Actions workflow invoked the edge function with the configured cron secret
- returned `HTTP 200`
- returned `success: true`
- returned `mode: "scheduler"`
- processed 50 due rows successfully

Remaining caveat:
- current environment still disables outbound client email delivery, so this proves runtime execution but not actual email send behavior

Why this matters:
- the previous main gap between “schema/function exists” and “the runtime path is proven live” is now closed

### Operational reminder trigger path
Status:
- frontend invoke path exists
- function config and auth guardrails are in place
- code-level tests pass

Still missing:
- live invocation proof in the correct authenticated/secret-backed context for the latest estimate-batch-aware runtime behavior

## 3. Blocked verification items

### End-to-end cadence invocation
No longer blocked for scheduler-mode proof.

A truthful scheduler-mode invocation was recovered from the existing scheduled GitHub Actions workflow that already holds `PROCESS_NOTIFICATION_CADENCE_SECRET`.

What remains unavailable from this session is only direct local invocation with the raw secret or an office/admin bearer JWT.

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

The formerly biggest DB checklist gap — truthful live invocation of `process-notification-cadence` in the intended auth/secret context — is now closed for scheduler mode and documented in `docs/process-notification-cadence-live-verification-2026-04-26.md`.

The remaining nuance is not runtime reachability; it is whether and when outbound client email delivery should be enabled and separately verified.

## 6. Practical next DB-status categories

### Closed enough for now
- additive schema rollout for jobs/thread/check-in/estimate review/send-batch primitives
- typed app alignment for those database primitives
- helper-boundary hardening for backend-only batch helpers

### Open, but only because of verification ceiling
- outbound delivery verification once client email delivery is intentionally enabled
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
