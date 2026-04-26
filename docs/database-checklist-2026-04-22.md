# Database Checklist - 2026-04-22

This is the current actionable database checklist, separated into **must do now**, **should do soon**, and **later consolidation**.

The goal is to distinguish:
- actual remaining production-risk DB work
- verification work
- longer-horizon backend cleanup

---

## Must do now

### 1. Truthfully verify `process-notification-cadence` live in the intended auth context
**Status:** Completed on 2026-04-26 in scheduler mode

**Why it matters:**
This was the clearest remaining gap between:
- DB/runtime structure existing, and
- the estimate-batch cadence/send path being operationally proven live

**Verification used:**
- scheduled GitHub Actions workflow `reminder-cadence`
- secret-backed scheduler invocation using `PROCESS_NOTIFICATION_CADENCE_SECRET`
- documented in `docs/process-notification-cadence-live-verification-2026-04-26.md`

**Observed result:**
- `HTTP 200`
- `success: true`
- `dry_run: false`
- `mode: "scheduler"`
- `processed_count = 50`

**Important caveat:**
- runtime execution is proven live
- outbound client email delivery was intentionally blocked by environment posture (`"Client email delivery is disabled until onboarding is complete"`), so this is not proof of real email delivery

**Exit condition:**
- met for runtime invocation proof
- any future outbound-delivery verification should be tracked separately from this checklist item

---

### 2. Keep migration truth source explicit and current
**Status:** Ongoing discipline item

**Why it matters:**
The safest current DB truth source is still:
1. remote migration history
2. targeted live RPC probing

**Needed:**
- keep using migration history and targeted probes for any new DB slice
- do not imply full schema parity from broken `db pull` flows

**Exit condition:**
- maintained discipline, not a one-time code change

---

## Should do soon

### 3. Improve full schema comparison confidence
**Status:** Advanced on 2026-04-26 via dump-based alternative; replay-safe pull still open as later cleanup

**Problem:**
`supabase db pull --linked --schema public --yes` is not replay-safe right now because `0001_initial.sql` is a context snapshot, not an executable baseline.

**Known failure:**
- FK replay failure around `admin_audit_logs.company_id -> public.companies`
- reconfirmed by fresh debug run on 2026-04-26

**New working alternative:**
- `supabase db dump --linked --schema public --file <path>` succeeds against the linked project
- documented in `docs/database-schema-dump-verification-2026-04-26.md`

**Why it matters:**
This restores a truthful whole-schema capture path without depending on shadow replay.

**Exit condition:**
- met enough for current checklist purposes via documented dump-based remote schema capture
- replay-safe baseline repair remains later tooling cleanup, not the current blocker

---

### 4. Reconfirm newest live DB primitives whenever a dependent runtime path changes
**Status:** Ongoing

**Why it matters:**
The app now depends on DB-owned read models and grouped estimate primitives. When surrounding runtime behavior changes, the latest live RPC/path should be rechecked rather than assumed.

**Current priority targets:**
- estimate review/group/detail paths
- estimate send batch summary / queue path
- cadence-owned estimate send flow

**Exit condition:**
- per-slice live probe evidence recorded whenever a new backend-dependent slice ships

---

## Later consolidation

### 5. Continue backend consolidation away from older mixed-generation structures
**Status:** Later

**Examples:**
- further retirement of legacy/older-generation structures as primary truth
- continue strengthening canonical newer backbone:
  - `rugs`
  - `rug_services`
  - `estimate_items`
  - `invoice_items`
  - messaging/logistics structures

**Why it matters:**
This is longer-horizon architecture cleanup, not immediate launch-critical DB risk.

**Exit condition:**
- future consolidation slices explicitly planned and executed one at a time

---

### 6. Improve long-term schema observability/tooling
**Status:** Later

**Examples:**
- better remote-schema comparison tooling
- cleaner repeatable live verification notes
- stronger DB checklist automation around new migrations/RPCs

**Why it matters:**
This reduces future uncertainty but is not the immediate blocker today.

---

## Closed enough for now

These do **not** appear to be the main remaining DB problem right now:

- forgotten recent migrations from the latest route/surface cleanup
- missing additive schema for current frontend route-model work
- missing estimate review/group/send-batch base primitives
- missing service snapshot semantics on `rug_services`
- missing jobs/thread/check-in summary RPC base layer

---

## Current honest summary

### Main remaining DB item
**No longer cadence runtime proof; the largest remaining open DB proof item is narrower than before and mostly about delivery posture / future outbound verification, not scheduler execution itself**

### Secondary DB item
**Schema capture confidence now has a workable dump-based path, while replay-safe baseline repair remains later cleanup**

### Not urgent right now
**Large new migration authoring spree**

---

## Recommended execution order

1. Treat scheduler-mode `process-notification-cadence` runtime proof as complete and use the recorded evidence doc when needed
2. Keep any future outbound-delivery verification separate from runtime-proof claims
3. Use the documented dump-based schema capture path when whole-schema confidence is needed
4. Treat `db pull` replay repair as later tooling cleanup, not the next blocker
5. Only then decide whether any new DB consolidation slice is actually necessary now
