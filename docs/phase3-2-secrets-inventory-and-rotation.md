# Phase 3.2 — Secrets Inventory and Rotation Schedule

## Goal
Map every runtime secret to an owner class and enforce a repeatable rotation schedule.

## Rotation policy baseline
- **Cadence:** every 90 days for standard secrets.
- **Immediate rotation triggers:** suspected leak, offboarding, provider compromise, or failed auth anomalies.
- **Owner model:** role-based owners to avoid blocking on a single individual.
  - **Engineering Owner**: application/runtime secrets and Supabase keys.
  - **Operations Owner**: alerting/email/webhook delivery and incident-routing secrets.

## Inventory table
| Secret | Scope | Owner class | Rotation cadence | Next rotation date |
|---|---|---|---|---|
| `SUPABASE_URL` | CI + scripts | Engineering Owner | 180 days | 2026-08-23 |
| `SUPABASE_ANON_KEY` | CI + scripts | Engineering Owner | 90 days | 2026-05-25 |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge functions | Engineering Owner | 90 days | 2026-05-25 |
| `SUPABASE_ACCESS_TOKEN` | Maintainer deploy tooling | Engineering Owner | 60 days | 2026-04-25 |
| `PORTAL_USER_EMAIL` | CI smoke/RLS | Engineering Owner | 180 days | 2026-08-23 |
| `PORTAL_USER_PASSWORD` | CI smoke/RLS | Engineering Owner | 90 days | 2026-05-25 |
| `OFFICE_USER_EMAIL` | CI smoke/RLS | Engineering Owner | 180 days | 2026-08-23 |
| `OFFICE_USER_PASSWORD` | CI smoke/RLS | Engineering Owner | 90 days | 2026-05-25 |
| `DRIVER_USER_EMAIL` | CI smoke/RLS | Engineering Owner | 180 days | 2026-08-23 |
| `DRIVER_USER_PASSWORD` | CI smoke/RLS | Engineering Owner | 90 days | 2026-05-25 |
| `SMOKE_USER_EMAIL` | CI smoke | Engineering Owner | 180 days | 2026-08-23 |
| `SMOKE_USER_PASSWORD` | CI smoke | Engineering Owner | 90 days | 2026-05-25 |
| `SLACK_WEBHOOK_URL` | Edge functions | Operations Owner | 90 days | 2026-05-25 |
| `OPS_ALERT_EMAILS` | Edge functions | Operations Owner | 180 days | 2026-08-23 |
| `OPS_ALERT_FROM_EMAIL` | Edge functions | Operations Owner | 180 days | 2026-08-23 |
| `PORTAL_ONBOARDING_EMAIL_FROM` | Edge functions | Operations Owner | 180 days | 2026-08-23 |
| `EMPLOYEE_ONBOARDING_EMAIL_FROM` | Edge functions | Operations Owner | 180 days | 2026-08-23 |
| `INVOICE_PDF_BUCKET` | Edge functions | Engineering Owner | 365 days | 2027-02-24 |

## Operating procedure
1. Rotate secrets in provider first (Supabase/GitHub/Resend/Slack as applicable).
2. Update GitHub Action secrets and Supabase Edge Function secrets in the same change window.
3. Run post-rotation validation:
   - `./scripts/staging-smoke-test.sh`
   - `./scripts/rls-scope-smoke-test.sh`
   - `./scripts/private-beta-readiness.sh`
4. Record rotation proof in release evidence (`docs/release-evidence/<release>.md`) under “Security and secret hygiene”.

## Validation gate status
**Complete for Phase 3.2 baseline:** all tracked secrets now have owner class and next rotation date.
