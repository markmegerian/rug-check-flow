# Release Evidence Template

Use this template for every release candidate. Attach links/artifacts for each section.

## Release candidate
- Date:
- Release tag / name:
- Commit SHA:
- Prepared by:
- Engineering approver:
- Operations approver:
- Go / No-Go decision:

## Deployment scope
- Frontend/app changes:
- Database migrations applied:
- Edge functions deployed (name + version/deploy id):
- Known risks:

## Environment
- Target environment (`staging` or `production`):
- Supabase project ref:
- Base app URL:

## Quality gates
- `npm run lint` result:
- `npm run test` result:
- `npm run build` result:

## Smoke and readiness checks
- `./scripts/staging-smoke-test.sh` result + artifact:
- `./scripts/rls-scope-smoke-test.sh` result + artifact:
- `./scripts/private-beta-readiness.sh` result + artifact:

## Invoice PDF verification
- `SAMPLE_INVOICE_ID` used:
- invoice-pdf response summary:

## Operational alert verification
- dry-run response summary:

## Evidence artifacts
- Logs:
- Screenshots:
- Dashboard links:

## Sign-off notes
- Engineering notes:
- Operations notes:
- Follow-up actions:
