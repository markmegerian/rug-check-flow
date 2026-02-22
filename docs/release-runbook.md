# Release Runbook (Staging -> Production)

This runbook is the operational checklist for promoting the RugBoost app.

## 1) Pre-release checklist

- [ ] `npm install` completed
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run build` passes
- [ ] All required migrations are committed and reviewed
- [ ] Staging environment variables and Supabase secrets are set

## 2) Required environment configuration

### Frontend (.env)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_ENABLE_DEV_SWITCHER` must remain `"false"` outside local development
- `VITE_INVOICE_PDF_BUCKET` (defaults to `invoice-pdfs`; should match your storage bucket for invoice artifacts)

### Supabase Edge Function secrets

- `ENABLE_DEV_LOGIN` (recommended `"false"` in staging/prod unless explicitly needed)
- `DEV_LOGIN_TEST_PASSWORD` (only required when dev login is enabled)
- `SUPABASE_SERVICE_ROLE_KEY` (required by edge functions that perform admin actions)

## 3) Migration and deploy order

1. Deploy database migrations to staging.
2. Deploy Supabase edge functions.
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

## 4) Staging smoke validation

The smoke script validates:

- Supabase auth login for a staging test user
- Read access to launch-critical workflow tables:
  - `pickup_requests`
  - `estimates`
  - `invoices`
- Optional frontend route reachability checks when `APP_BASE_URL` is provided

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

