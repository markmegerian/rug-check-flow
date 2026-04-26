# Database Checklist - 2026-04-22

This is the current actionable database checklist, separated into **must do now**, **should do soon**, and **later consolidation**.

The goal is to distinguish:
- actual remaining production-risk DB work
- verification work
- longer-horizon backend cleanup

---

## Must do now

### 1. Truthfully verify `process-notification-cadence` live in the intended auth context
**Status:** Open, blocked by credentials

**Why it matters:**
This is the clearest remaining gap between:
- DB/runtime structure existing, and
- the estimate-batch cadence/send path being operationally proven live

**Needed:**
- valid `x-cron-secret` matching `PROCESS_NOTIFICATION_CADENCE_SECRET`, or
- valid office/admin JWT suitable for truthful manual invocation

**Done already:**
- function deployed to correct project
- helper boundary cleaned up
- supporting DB primitives applied live
- code-level tests passing

**Exit condition:**
- successful documented live invocation result, ideally dry-run first, with truthful recorded output

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
**Live end-to-end cadence verification**

### Secondary DB item
**Live end-to-end cadence verification remains the main open DB proof gap; schema capture confidence now has a workable dump-based path**

### Not urgent right now
**Large new migration authoring spree**

---

## Recommended execution order

1. Verify `process-notification-cadence` live with the right credential context
2. Record result in docs with exact verification boundary/output
3. Use the documented dump-based schema capture path when whole-schema confidence is needed
4. Treat `db pull` replay repair as later tooling cleanup, not the next blocker
5. Only then decide whether any new DB consolidation slice is actually necessary now
