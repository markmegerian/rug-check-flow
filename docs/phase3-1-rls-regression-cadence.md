# Phase 3.1 — Automated RLS Regression Cadence

## Goal
Run role-scoped RLS regression checks automatically every day in staging and retain evidence artifacts for review.

## Implementation delivered
- Added GitHub Actions workflow: `.github/workflows/rls-regression-daily.yml`.
- Schedule: every day at `06:15 UTC` plus manual `workflow_dispatch` runs.
- Required secret guardrails fail fast when role credentials are missing.
- Executes `./scripts/rls-scope-smoke-test.sh` and stores log artifact as `rls-regression-<run_id>`.

## Required secrets
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `PORTAL_USER_EMAIL`
- `PORTAL_USER_PASSWORD`
- `OFFICE_USER_EMAIL`
- `OFFICE_USER_PASSWORD`
- `DRIVER_USER_EMAIL`
- `DRIVER_USER_PASSWORD`

Optional expectation controls (used by smoke script when provided):
- `EXPECTED_PORTAL_CLIENT_ID`
- `EXPECTED_DRIVER_USER_ID`

## Evidence and sign-off
To satisfy the Phase 3.1 validation gate, attach:
1. Seven consecutive successful workflow runs.
2. Artifact links for each run (`artifacts/rls-scope-smoke-daily.log`).
3. Any remediation actions if an intermittent failure occurred.

Current status: **Automation shipped; seven-day clean run window in progress.**
