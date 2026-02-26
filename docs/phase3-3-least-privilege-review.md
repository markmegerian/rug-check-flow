# Phase 3.3 — Least-Privilege Review

## Goal
Review service-role and admin-only surfaces, confirm privilege boundaries, and document an auditable checklist.

## Privileged surface checklist

| Surface | Expected privilege boundary | Verification method | Status |
|---|---|---|---|
| Edge functions using `SUPABASE_SERVICE_ROLE_KEY` (`invoice-pdf`, admin controls, onboarding senders) | Service role usage limited to server-side execution only; no client exposure | Function source review + secret location check in Supabase edge-function settings | ✅ |
| `public` schema RLS posture | RLS enabled on user-facing operational tables | RLS smoke script + SQL audit query (RLS-disabled table check) | ✅ |
| SECURITY DEFINER functions | Only approved routines; explicit owner and intended usage documented | SQL audit query for `prosecdef=true` and role grants | ✅ (pending run evidence per environment) |
| Grants to `anon` and `authenticated` | Restrict to minimum table/function access necessary for app flows | SQL audit query for table/routine grants | ✅ (pending run evidence per environment) |
| Portal access scope | Portal users restricted to mapped `client_id` records | `./scripts/rls-scope-smoke-test.sh` and role-scope tests | ✅ |
| Driver scope | Driver users restricted to assignment-specific pickup records | `./scripts/rls-scope-smoke-test.sh` | ✅ |

## Audit execution pack
Run `scripts/sql/phase3-3-least-privilege-audit.sql` in:
1. Staging project
2. Production project

Attach resulting output in release evidence under:
- `Security and secret hygiene`
- `Least-privilege review artifacts`

## Required evidence for Phase 3.3 sign-off
1. Staging SQL audit output attached.
2. Production SQL audit output attached.
3. Latest `rls-scope-smoke-test` output attached.
4. Any exceptions/remediations logged with owner + ETA.

## Validation gate status
**Complete for Phase 3.3 baseline:** privileged-surface checklist is defined and automation/query pack is ready.
Final sign-off remains tied to per-environment artifact attachment on each release candidate.
