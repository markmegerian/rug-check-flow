# Phase 2.3 — Synthetic Checks

Status: Implemented
Date: 2026-02-24

## What was added
- Script: `scripts/synthetic-probe.sh`
  - Authenticates as office user.
  - Probes critical REST tables (`pickup_requests`, `estimates`, `invoices`).
  - Probes core edge functions (`invoice-pdf`, `operational-alerts`).
  - Optionally probes frontend routes when `APP_BASE_URL` is provided.
  - Writes `artifacts/synthetic-probe-report.json` and exits non-zero on any failed check.
- Workflow: `.github/workflows/synthetic-probes.yml`
  - Runs every 30 minutes and on demand.
  - Fails fast if required probe secrets are missing.
  - Uploads JSON report artifact for pass/fail history.

## Validation gate mapping
- Probe pass/fail history visible: satisfied via recurring GitHub Actions runs + uploaded artifacts.
- Alerting wired for failures: satisfied via failing scheduled workflow (GitHub notifications/integrations).

## Operational notes
- Add `APP_BASE_URL` secret to include route probes.
- Set `SAMPLE_INVOICE_ID` secret to pin invoice probe; if unset, script derives one via office scope.
