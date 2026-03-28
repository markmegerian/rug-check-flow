# Remaining Company Scope Rollout Plan

_Last updated: 2026-03-28_

This doc breaks down the remaining company-scoping work after `clients.company_id` and `portal_users.company_id` were fixed on 2026-03-28.

The goal is to finish company ownership on legacy workflow/accounting tables in a way that is:
- derivable from existing foreign keys
- backfillable without inventing business data
- safe to roll out in stages
- easy to verify with repeatable audits

## Why this exists

During live prod audit and stabilization work, we confirmed that several important tables still do **not** have `company_id`, even though the project is already moving toward company-scoped access and ownership.

Confirmed missing in prod during audit:
- `rugs.company_id`
- `invoices.company_id`
- `payments.company_id`
- `approved_estimates.company_id`
- `client_service_selections.company_id`
- `service_completions.company_id`

## Principles

1. Prefer **derived ownership** over manual entry.
2. Add columns as **nullable first**, then backfill, then add insert-time autofill, then consider stricter constraints.
3. Roll out in dependency order so downstream backfills can use upstream columns.
4. Add smoke/audit coverage before calling a phase done.
5. Do not silently rewrite historical rows where lineage is ambiguous.

---

## Dependency map

### Directly derivable from `clients.company_id`
- `rugs` via `rugs.client_id -> clients.id`
- `invoices` via `invoices.client_id -> clients.id`
- `payments` via `payments.client_id -> clients.id`

### Derivable from `jobs.company_id` / `inspections.company_id`
- `approved_estimates` via `approved_estimates.job_id -> jobs.id`
  - fallback: `approved_estimates.inspection_id -> inspections.id`

### Derivable from already-scoped upstream records
- `service_completions` via `service_completions.approved_estimate_id -> approved_estimates.id`
- `client_service_selections` via:
  - `client_service_selections.approved_estimate_id -> approved_estimates.id`
  - fallback: `client_service_selections.client_job_access_id -> client_job_access.id`

---

## Recommended rollout phases

## Phase A — Foundation ownership columns

### Tables
- `rugs`
- `invoices`
- `payments`

### Why first
These have the simplest lineage and cover the most important business objects.

### Rollout shape
1. Add nullable `company_id uuid references public.companies(id) on delete set null`
2. Add indexes
3. Backfill from `clients.company_id`
4. Add insert-time autofill trigger from related client
5. Add a smoke/audit check for column presence + null counts

### Desired end state
- new rows inherit company automatically when client exists
- historical rows backfill where client lineage is present
- ambiguous rows remain visible as nulls for manual cleanup

---

## Phase B — Workflow lineage columns

### Tables
- `approved_estimates`
- `service_completions`
- `client_service_selections`

### Why second
These depend on other workflow tables and should follow after the more foundational ownership columns are stable.

### Rollout shape
1. Add nullable `company_id`
2. Backfill `approved_estimates` from `jobs.company_id`, fallback to `inspections.company_id`
3. Backfill `service_completions` from `approved_estimates.company_id`
4. Backfill `client_service_selections` from `approved_estimates.company_id`, fallback to `client_job_access.company_id`
5. Add insert-time autofill triggers where inserts still happen in app flows
6. Add audit coverage

---

## Phase C — Tightening and RLS follow-through

After Phases A and B are live and clean enough:
- review whether any of the new `company_id` columns should become `not null`
- review RLS/policy simplifications that can rely on direct company ownership
- add app queries/selects where direct company filtering is more efficient than relationship joins
- review whether legacy tables still missing company ownership actually need it

---

## Table-by-table notes

## `rugs`
**Current lineage:** `rugs.client_id -> clients.id -> clients.company_id`

**Confidence:** High

**Notes:**
- heavily used in facility and office flows
- likely the next best table to scope after clients/portal users
- could later simplify route-stop and estimate queries

## `invoices`
**Current lineage:** `invoices.client_id -> clients.id -> clients.company_id`

**Confidence:** High

**Notes:**
- very important for billing visibility and ownership
- historical orphan invoice already exists with `client_id = null`; do not let that single artifact drive bad constraints
- if `company_id` is added, invoice guard logic should stay focused on `client_id` as the stronger business invariant

## `payments`
**Current lineage:** `payments.client_id -> clients.id -> clients.company_id`

**Confidence:** High when `client_id` is present

**Notes:**
- some rows may be more naturally derived from invoice allocations too, but `client_id` is the straightforward first path
- keep rollout tolerant of historical edge cases

## `approved_estimates`
**Current lineage:**
- primary: `job_id -> jobs.company_id`
- fallback: `inspection_id -> inspections.company_id`

**Confidence:** Medium-high

**Notes:**
- this should likely be done before any deeper portal estimate/thread work

## `service_completions`
**Current lineage:** `approved_estimate_id -> approved_estimates.company_id`

**Confidence:** High after `approved_estimates.company_id` exists

## `client_service_selections`
**Current lineage:**
- primary: `approved_estimate_id -> approved_estimates.company_id`
- fallback: `client_job_access_id -> client_job_access.company_id`

**Confidence:** Medium-high

**Notes:**
- backfill order matters here
- do this after `approved_estimates.company_id`

---

## Verification strategy

Use `scripts/company-scope-audit.sh` to check:
- whether each target table exposes `company_id`
- whether rows with lineage still remain null after rollout
- what the current prod shape looks like before/after migrations

Recommended checks after each phase:
1. `supabase db push --linked --include-all --dry-run`
2. live REST audit of column presence
3. targeted null-count review
4. focused app-path smoke for affected flows

---

## Suggested implementation order

1. `rugs.company_id`
2. `invoices.company_id`
3. `payments.company_id`
4. `approved_estimates.company_id`
5. `service_completions.company_id`
6. `client_service_selections.company_id`

This keeps the rollout aligned with lineage complexity and business impact.
