# Private Beta Launch Checklist

This checklist is the final gate before sending private beta invitations.

## 1) Infrastructure and migrations

- [ ] Apply latest migrations in staging, including:
  - `20260222130000_phase5_invoice_pdf_storage_bucket.sql`
  - `20260222131000_phase5_payment_attempts_on_paid_status.sql`
- [ ] Confirm `invoice-pdfs` bucket exists and is private.

## 2) Edge functions and environment

- [ ] Deploy edge functions:
  - `checkout-delivery`
  - `admin-provision-employee`
  - `send-estimate-email`
  - `send-portal-onboarding-email`
  - `invoice-pdf`
  - `operational-alerts`
- [ ] Ensure edge function secrets are configured:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_ANON_KEY`
  - `INVOICE_PDF_BUCKET` (optional; default `invoice-pdfs`)
  - `SLACK_WEBHOOK_URL` (optional for critical Slack notifications)
  - `OPS_ALERT_EMAILS` and `OPS_ALERT_FROM_EMAIL` (optional for email notifications)
  - `PORTAL_ONBOARDING_EMAIL_FROM` and `PORTAL_APP_URL` (optional for wholesale onboarding emails)

## 3) Auth and role setup

- [ ] Seed internal users with `office`/`admin` roles.
- [ ] Seed driver users with `driver` role.
- [ ] Seed portal users in `portal_users` with active status and correct `client_id`.

## 4) Billing workflow verification

- [ ] In Office tab:
  - create draft invoice,
  - mark invoice as sent,
  - download PDF successfully.
- [ ] In Portal tab:
  - open invoice detail,
  - download PDF successfully,
  - verify payment attempt timeline renders.
- [ ] Verify first-login portal onboarding auto-opens for a portal-linked user and completion is persisted.
- [ ] Mark a sent invoice as paid and verify a `payment_attempts` row is auto-created.
- [ ] Trigger a dry-run of `operational-alerts` and confirm critical reminder summary returns.

## 5) Automated readiness checks

- [ ] Run:

  ```sh
  ./scripts/private-beta-readiness.sh
  ```

- [ ] If running in CI, configure required secrets for optional role-scoped tests.

## 6) Operational launch controls

- [ ] Define on-call owner for beta window.
- [ ] Define bug triage channel + SLA (P0/P1).
- [ ] Prepare rollback owner and rollback path.
