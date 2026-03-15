# Release Evidence Dry Run — Phase 1.1

## Release candidate
- Date: 2026-02-24
- Release tag / name: phase1.1-evidence-dry-run
- Commit SHA: 2e787cf
- Prepared by: Codex
- Engineering approver: Pending
- Operations approver: Pending
- Go / No-Go decision: **Go (dry-run only)**

## Deployment scope
- Frontend/app changes: none (documentation + script observability only)
- Database migrations applied: none in this dry-run
- Edge functions deployed: none in this dry-run
- Known risks: none identified for this documentation/scripting scope

## Environment
- Target environment (`staging` or `production`): staging
- Supabase project ref: toitgmaeuscrdwbpntda
- Base app URL: N/A (API smoke only)

## Quality gates
- `npm run lint` result: pass
- `npm run test` result: pass (10 passed / 3 skipped)
- `npm run build` result: pass

## Smoke and readiness checks
- `./scripts/staging-smoke-test.sh` result + artifact: pass (pickup_requests, estimates, invoices, invoice_items, payment_attempts)
- `./scripts/rls-scope-smoke-test.sh` result + artifact: pass (portal/office/driver scopes green)
- `./scripts/private-beta-readiness.sh` result + artifact: pass (all 5 steps complete)

## Invoice PDF verification
- `SAMPLE_INVOICE_ID` used: `0f49fb6d-d509-434b-bdc9-eb0f7cb35aca`
- invoice-pdf response summary: signed URL returned successfully

## Operational alert verification
- dry-run response summary: success=true

## Evidence artifacts
- Logs: terminal output from readiness run captured in CI/session execution log
- Screenshots: none (no UI change in this subphase)
- Dashboard links: not required for this dry-run

## Sign-off notes
- Engineering notes: Evidence contract tested and runnable.
- Operations notes: Pending formal owner assignment for production releases.
- Follow-up actions:
  - Adopt this template for every release candidate.
  - Add CI upload/archive step for artifacts in Phase 1.2.
