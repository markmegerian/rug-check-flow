# Release Runbook (Staging -> Production)

This runbook is the operational checklist for promoting the RugBoost app.

## 1) Pre-release checklist

- [ ] `npm install` completed
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run build` passes
- [ ] All required migrations are committed and reviewed
- [ ] Staging environment variables and Supabase secrets are set
- [ ] Release evidence document created from `docs/release-evidence/template.md`

## 2) Required environment configuration

### Frontend (.env)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_ENABLE_DEV_SWITCHER` must remain `"false"` outside local development
- `VITE_REQUIRE_SUPABASE_ENV` (optional; set `"true"` to enforce strict fail-fast when Supabase vars are missing)
- `VITE_ENABLE_OPERATIONAL_REMINDERS` (optional; set `"false"` if reminder tables are not present in the current environment)
- `VITE_ENABLE_OPERATIONAL_ALERTS` (optional; set `"true"` only when `operational-alerts` is deployed and ready)

### Supabase Edge Function secrets

- `ENABLE_DEV_LOGIN` (recommended `"false"` in staging/prod unless explicitly needed)
- `DEV_LOGIN_TEST_PASSWORD` (only required when dev login is enabled)
- `SUPABASE_SERVICE_ROLE_KEY` (required by edge functions that perform admin actions)
- `INVOICE_PDF_BUCKET` (optional override; defaults to `invoice-pdfs`)
- `SLACK_WEBHOOK_URL` (optional; enables Slack dispatch for critical operational alerts)
- `OPS_ALERT_EMAILS` (optional CSV list for critical operational alert emails)
- `OPS_ALERT_FROM_EMAIL` (optional sender identity for operational alert emails)

## 3) Migration and deploy order

1. Deploy database migrations to staging.
2. Deploy Supabase edge functions.
   - Ensure `invoice-pdf` and `operational-alerts` are deployed alongside existing functions.
3. Deploy frontend build.
4. Run staging smoke test script:

   ```sh
   ./scripts/staging-smoke-test.sh
   ```

5. Run role-scope RLS smoke script:

   ```sh
   ./scripts/rls-scope-smoke-test.sh
   ```

6. Run optional role-scoped integration test (when test credentials are available):

   ```sh
   npm run test -- src/test/role-scope.integration.test.ts
   ```

7. Verify smoke output is all green before production promote.
8. Run private beta readiness gate when preparing invite wave:

   ```sh
   ./scripts/private-beta-readiness.sh
   ```
9. Save outputs in a release evidence file (`docs/release-evidence/<release-name>.md`) and attach logs/artifacts.

## Release evidence contract (Phase 1.1)

Use `docs/release-evidence/template.md` for every release candidate. Minimum required fields:

1. Release metadata (date, commit SHA, approvers, decision).
2. Deployment scope (migrations + function versions).
3. Quality gates (`lint`, `test`, `build`).
4. Smoke/readiness outputs (`staging-smoke`, `rls-scope-smoke`, `private-beta-readiness`).
5. Invoice PDF and operational alert verification summary.

Dry-run example: `docs/release-evidence/phase1-1-dry-run.md`.


## 3.1) Release sign-off workflow (Phase 1.4)

A release cannot ship without both sign-offs recorded in the release evidence file.

- Engineering go/no-go owner
  - [ ] Confirms migration + edge-function versions match intended release scope
  - [ ] Confirms lint/test/build and readiness checks are green
  - [ ] Confirms rollback plan is valid for this release
- Operations go/no-go owner
  - [ ] Confirms environment secrets and alert channels are valid
  - [ ] Confirms incident contact path and on-call owner are active
  - [ ] Confirms smoke evidence artifacts are attached

Store final decision in `docs/release-evidence/<release-name>.md` under **Go / No-Go decision**.

## 4) Staging smoke validation

The smoke script validates:

- Supabase auth login for a staging test user
- Read access to launch-critical workflow tables:
  - `pickup_requests`
  - `estimates`
  - `invoices`
  - `invoice_items`
  - `payment_attempts`
- Optional frontend route reachability checks when `APP_BASE_URL` is provided
- Optional invoice PDF artifact + signed URL validation when `SAMPLE_INVOICE_ID` is provided

The role-scope RLS script validates:

- Portal user scoped reads on invoices and pickup requests
- Portal user scoped reads on:
  - `portal_users`
  - `invoices`
  - `invoice_items`
  - `payment_attempts`
  - `pickup_requests`
- Office user broad operational reads across the same core tables
- Driver user reads for assigned pickup workflow tables
- Optional strict client/driver assertions when these are provided:
  - `EXPECTED_PORTAL_CLIENT_ID`
  - `EXPECTED_DRIVER_USER_ID`


## 4.1) Observability baseline references (Phase 2)

- SLO + alert thresholds: `docs/slo-alert-thresholds.md`
- Dashboard baseline plan: `docs/phase2-2-dashboard-baseline.md`
- Synthetic checks: `docs/phase2-3-synthetic-checks.md`
- Game day runbook: `docs/phase2-4-game-day-runbook.md`

Use these observability docs together when configuring dashboard panels, synthetic checks, and incident drills.

## 4.2) Security baseline references (Phase 3)

- Automated RLS cadence: `docs/phase3-1-rls-regression-cadence.md`
- Secrets inventory + rotation plan: `docs/phase3-2-secrets-inventory-and-rotation.md`
- Least-privilege checklist + audit pack: `docs/phase3-3-least-privilege-review.md`
- Retention + compliance policy: `docs/phase3-4-retention-and-compliance-policy.md`

Use these security docs to validate recurring RLS posture and secrets hygiene before each production promote.

## 4.3) Product quality references (Phase 4)

- Beta feedback triage register: `docs/phase4-1-beta-feedback-triage.md`
- Critical journey acceptance coverage: `docs/phase4-2-critical-journey-acceptance.md`
- UX consistency pass checklist: `docs/phase4-3-ux-consistency-pass.md`

Use the triage register to ensure only P2/P3 items remain open before final launch-candidate stabilization.

## 4.4) Launch readiness references (Phase 5)

- Phase 5.1 schema/migration freeze: `docs/phase5-1-schema-and-migration-freeze.md`
- Phase 5.2 full staging rehearsal: `docs/phase5-2-full-staging-rehearsal.md`
- Phase 5.3 controlled rollout + page-by-page UAT: `docs/phase5-3-controlled-rollout-and-page-by-page-uat.md`
- Phase 5.4 launch monitoring watch: `docs/phase5-4-launch-monitoring-watch.md`

Use these docs to package final launch-candidate evidence before production cutover.

If merges/PR creation are blocked during release prep, use `docs/git-merge-pr-recovery.md`.

## 5) Production promote

1. Confirm staging smoke test has passed in the release commit.
2. Apply the exact same migration set to production.
3. Deploy edge functions to production.
4. Deploy frontend to production.
5. Re-run smoke checks against production credentials.

## 6) Rollback guidance

If a release fails:

1. Stop rollout and notify the team.
2. Roll frontend back to previous build.
3. Revert edge function deployment to previous version.
4. For DB changes:
   - Prefer forward-fix migrations.
   - If absolutely necessary, apply reviewed rollback SQL scripts.
5. Re-run smoke tests before reopening access.
