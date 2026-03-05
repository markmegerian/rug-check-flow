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

**Required for all functions:**
- `SUPABASE_URL` (Supabase project URL)
- `SUPABASE_SERVICE_ROLE_KEY` (required by edge functions that perform admin actions)
- `SUPABASE_ANON_KEY` (public anon key for auth validation)

**Function-specific secrets:**

- `ENABLE_DEV_LOGIN` (recommended `"false"` in staging/prod unless explicitly needed)
- `DEV_LOGIN_TEST_PASSWORD` (only required when dev login is enabled)
- `INVOICE_PDF_BUCKET` (optional override; defaults to `invoice-pdfs`)

**Operational alerts:**
- `SLACK_WEBHOOK_URL` (optional; enables Slack dispatch for critical operational alerts)
- `OPS_ALERT_EMAILS` (optional CSV list for critical operational alert emails)
- `OPS_ALERT_FROM_EMAIL` (optional sender identity for operational alert emails)

**ingest-stop-events function:**
- `SUPABASE_URL` (required)
- `SUPABASE_SERVICE_ROLE_KEY` (required for admin operations)
- `SUPABASE_ANON_KEY` (required for auth validation)

**Note:** The `ingest-stop-events` function uses the same Supabase credentials as other functions. No additional secrets are required beyond the standard set above.

## 3) Migration and deploy order

**Critical: Deploy in this exact order to avoid breaking changes**

1. **Deploy database migrations to staging.**
   - Apply all migrations in chronological order
   - Verify migrations complete successfully
   - Check for any migration errors or warnings

2. **Deploy Supabase edge functions.**
   - Deploy `ingest-stop-events` (requires new tables: route_stops, route_stop_items, route_stop_events)
   - Deploy `invoice-pdf` (requires payments, credit_memos tables)
   - Deploy `operational-alerts`
   - Deploy any other edge functions
   - Verify function deployments complete successfully

3. **Deploy frontend build.**
   - Build must include all new UI components for stops, payments, credit memos
   - Verify build completes without errors
   - Deploy to staging environment

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

Before Phase 5.3 sign-off, run `./scripts/phase5-3-verify-remediation.sh` to confirm code-level remediation checks are present for currently implemented Sev1/Sev2 fixes.

## 5) Production promote

1. Confirm staging smoke test has passed in the release commit.
2. Apply the exact same migration set to production.
3. Deploy edge functions to production.
4. Deploy frontend to production.
5. Re-run smoke checks against production credentials.

## 6) Rollback guidance

If a release fails, follow these steps in order:

### Immediate actions

1. **Stop rollout and notify the team.**
   - Pause any ongoing deployments
   - Alert on-call engineer and operations team
   - Document the failure point and symptoms

2. **Assess impact.**
   - Determine which components are affected (frontend, functions, database)
   - Check if data integrity is at risk
   - Verify if any partial deployments occurred

### Rollback steps (in reverse deployment order)

3. **Roll frontend back to previous build.**
   - Revert to the last known good frontend deployment
   - Verify frontend is accessible and functional
   - Check that UI components load correctly

4. **Revert edge function deployment to previous version.**
   - Roll back `ingest-stop-events` if deployed
   - Roll back `invoice-pdf` if deployed
   - Roll back `operational-alerts` if deployed
   - Verify functions are accessible and responding

5. **For database changes:**
   - **Prefer forward-fix migrations** over rollback migrations
   - Create new migration to fix issues rather than reverting
   - If rollback is absolutely necessary:
     - Review rollback SQL scripts before execution
     - Test rollback in staging first
     - Document any data loss or transformation required
     - Apply rollback migration carefully with backups
   - **Critical tables to check:**
     - `route_stops`, `route_stop_items`, `route_stop_events` (stop pipeline)
     - `payments`, `payment_allocations`, `credit_memos` (billing)
     - `message_threads`, `messages` (messaging)
     - `notification_cadence` (email automation)

6. **Verify rollback success.**
   - Re-run smoke tests against rolled-back environment
   - Verify critical workflows still function:
     - Stop ingestion pipeline
     - Invoice creation and payment processing
     - Messaging threads
   - Check database integrity
   - Confirm no data corruption occurred

7. **Reopen access only after verification.**
   - Ensure all smoke tests pass
   - Confirm no critical errors in logs
   - Get sign-off from engineering lead before reopening

### Rollback considerations for new features

**Stop pipeline rollback:**
- If `route_stops` tables are rolled back, ensure drivers can still use previous workflow
- Check that offline event queue can drain properly
- Verify no orphaned route_stop_events remain

**Billing rollback:**
- If `payments` or `credit_memos` tables are rolled back, ensure invoices remain accessible
- Verify invoice balance calculations still work
- Check that payment allocations are preserved

**Messaging rollback:**
- If `message_threads` tables are rolled back, ensure communication_events still work
- Verify notification cadence doesn't break

### Post-rollback

8. **Document the incident.**
   - Record what failed and why
   - Document rollback steps taken
   - Update runbook with lessons learned
   - Create follow-up tasks to fix root cause

9. **Plan forward-fix.**
   - Identify the root cause
   - Create forward-fix migration or code changes
   - Test fix thoroughly in staging
   - Schedule re-deployment with fixes
