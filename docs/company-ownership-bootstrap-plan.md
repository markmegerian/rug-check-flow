# Company Ownership Bootstrap Plan

_Last updated: 2026-03-28_

This doc covers **Phase 0** of company scoping: bootstrap upstream company ownership before adding more downstream `company_id` columns.

## Why this is necessary

Live prod audit confirmed:
- `companies` has 0 rows
- `company_memberships` has 0 rows
- all existing clients still have `clients.company_id = null`

That means downstream company scoping cannot be meaningfully backfilled yet.

## Recommended path

Assume the current production deployment is effectively **single-company** unless there is confirmed real-world multi-company data already in use.

### Phase 0 outcome
1. Create one real `companies` row for the operating business
2. Create `company_memberships` rows for the correct internal owner/admin users
3. Backfill `clients.company_id` to that company for the legacy client base
4. Re-run company-scope audit
5. Only then begin downstream table rollout

## Decision needed before migration

Choose the intended owner set for the initial company bootstrap.

Use:
- `scripts/company-ownership-bootstrap-audit.sh`

That script shows candidate internal users based on existing roles:
- `admin`
- `office`
- `checkin_staff`

## Suggested default bootstrap model

If no real multi-company separation exists yet:
- create one company row for the current business
- assign `admin` and primary `office` users as memberships
- backfill all existing clients to that company
- defer true multi-company segmentation until there is an actual business need

## Migration shape (recommended)

1. Insert `companies` row
2. Insert `company_memberships` rows for chosen users
3. Backfill `clients.company_id` where null
4. Validate `get_user_company_id(auth.uid())` now resolves for office/admin flows
5. Re-run:
   - `scripts/company-scope-audit.sh`
   - client create / portal user create smoke

## Do not do this yet

Do **not** add more downstream `company_id` columns until upstream ownership exists in prod, or we will just create more nullable dead columns.
