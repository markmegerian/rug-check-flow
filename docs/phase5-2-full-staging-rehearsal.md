# Phase 5.2 — Full Staging Rehearsal

## Goal
Execute the full release runbook in staging with production-like credentials/data and capture one complete evidence package.

## Rehearsal sequence
1. Confirm schema/migration freeze state (Phase 5.1 checklist).
2. Run quality gates:
   - `npm run lint`
   - `npm run test`
   - `npm run build`
3. Run readiness gates:
   - `./scripts/staging-smoke-test.sh`
   - `./scripts/rls-scope-smoke-test.sh`
   - `./scripts/private-beta-readiness.sh`
4. Verify release artifacts uploaded/linked:
   - readiness logs
   - role-scope smoke logs
   - synthetic probe report

## Evidence package contents
- Release candidate commit SHA
- Migration manifest snapshot
- Edge function versions/deploy references
- Gate command outputs with timestamps
- Go/no-go decision record

## Validation gate
Phase 5.2 is complete when:
1. Entire runbook executes end-to-end in staging.
2. All required evidence artifacts are attached.
3. Go/no-go decision is recorded and signed in release evidence.

Current status: **Complete for rehearsal plan and evidence template baseline**.
Live execution remains required per release candidate.
