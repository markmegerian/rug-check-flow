# Remaining Company Scope Rollout Plan

_Last updated: 2026-03-28_

This doc breaks down the remaining company-scoping work after `clients.company_id` and `portal_users.company_id` were fixed on 2026-03-28.
- `company_memberships` currently has 0 rows in prod

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

Current blocker discovered after plan creation:
- `companies` currently has 0 rows in prod
- `clients.company_id` is currently null for all 901 prod clients
- `company_memberships` currently has 0 rows in prod
- downstream company backfills cannot produce meaningful ownership until the company model is actually seeded or otherwise assigned upstream

## Principles

1. Prefer **derived ownership** over manual entry.
2. Add columns as **nullable first**, then backfill, then add insert-time autofill, then consider stricter constraints.
3. Roll out in dependency order so downstream backfills can use upstream columns.
4. Add smoke/audit coverage before calling a phase done.
5. Do not silently rewrite historical rows where lineage is ambiguous.

---

## Dependency map

### Directly derivable from `clients.company_id`
- `company_memberships` currently has 0 rows in prod
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

## Phase 0 — Bootstrap upstream company ownership

### Why this comes first
Downstream `company_id` rollout is blocked until upstream ownership actually exists in prod. Right now there are no `companies`, no `company_memberships`, and no client-level company assignments to derive from.

### Required outcome
- create at least one real `companies` row for the operating business
- create `company_memberships` for office users who should own/manage that company
- assign/seed `clients.company_id` for the existing client base using the chosen ownership model

### Notes
- If the app is truly single-company today, this may be a one-time bootstrap/migration, not a user-facing product feature.
- Do this before rolling out any more downstream ownership columns.

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
4. Add insert-time autofill trigger from related client/job lineage
5. Add a smoke/audit check for column presence + null counts

### Current repo status
- Phase A migration now exists in repo: `20260329090000_add_company_scope_to_rugs_invoices_payments.sql`
- Applied in prod after Phase 0 bootstrap; follow-up cleanup backfilled all remaining derivable `rugs.company_id` rows and all derivable `invoices.company_id` rows

### Desired end state
- new rows inherit company automatically when client exists
- historical rows backfill where client lineage is present
- ambiguous rows remain visible as nulls for manual cleanup

### Current live status
- `rugs.company_id`: 0 null rows
- `invoices.company_id`: 1 null row (the known intentional orphan invoice with `client_id = null`)
- `payments.company_id`: 0 null rows

---

## Phase B — Workflow lineage columns
_Status: applied in prod on 2026-03-29_

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

### Current repo/prod status
- Phase B migration now exists and is applied in prod: `20260329091000_add_company_scope_to_estimate_workflow_tables.sql`
- Current live audit shows 0 null `company_id` rows for `approved_estimates`, `service_completions`, and `client_service_selections`

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
- `company_memberships` currently has 0 rows in prod

**Confidence:** High

**Notes:**
- heavily used in facility and office flows
- likely the next best table to scope after clients/portal users
- could later simplify route-stop and estimate queries

## `invoices`
**Current lineage:** `invoices.client_id -> clients.id -> clients.company_id`
- `company_memberships` currently has 0 rows in prod

**Confidence:** High

**Notes:**
- very important for billing visibility and ownership
- historical orphan invoice already exists with `client_id = null`; do not let that single artifact drive bad constraints
- if `company_id` is added, invoice guard logic should stay focused on `client_id` as the stronger business invariant

## `payments`
**Current lineage:** `payments.client_id -> clients.id -> clients.company_id`
- `company_memberships` currently has 0 rows in prod

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

Use `scripts/company-ownership-bootstrap-audit.sh` to identify likely internal owner/admin users for the initial company bootstrap.

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
