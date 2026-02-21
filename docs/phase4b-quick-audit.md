# Phase 4B Quick Audit (post-skill setup)

## Scope of this audit

This is a focused follow-up audit after enabling the custom workflow skills (`phase-executor`, `portal-supabase-pattern`, and `rls-policy-normalizer`) to confirm where the codebase stands before continuing Phase 4B.

## Current state summary

- **Phase 4A outputs are present**: portal client resolver exists, portal tabs are live/typed, and policy normalization migration is in place.
- **Primary remaining debt is now outside portal tabs**: several `office` and `facility` surfaces still rely on `(supabase as any)` and loose casts.
- **Admin remains mock-backed** and should stay explicitly out-of-scope unless Phase 4B requirements change.

## Fast findings from repo scan

### 1) Loose typing still concentrated in office/facility

Examples identified in active files:
- `src/components/office/EstimatesTab.tsx`
- `src/components/office/PickupRequestsTab.tsx`
- `src/components/facility/CheckInLayout.tsx`
- `src/components/facility/ProductionBoard.tsx`

These are the largest immediate candidates for Phase 4B hardening if we want to continue reducing regression risk.

### 2) RLS style is normalized by latest migration, but historical migrations still show older patterns

Older migration files still contain `auth.users` joins; this is expected historically and acceptable as long as current end-state policy migrations are applied in order.

### 3) Planning doc needs interpretation as a timeline, not literal current-state truth

`docs/phase4-readiness-review.md` intentionally includes pre-4A findings earlier in the document and post-4A completion updates later. When using it during implementation, treat it as a **progress narrative** with historical context, not a single-point-in-time snapshot.

## Recommended Phase 4B plan adjustments

1. **Prioritize office tabs first** (highest user-impact + concentrated `any` usage):
   - `office/EstimatesTab.tsx`
   - `office/PickupRequestsTab.tsx`
   - `office/InvoicesTab.tsx`
2. **Apply the portal typing pattern to office data access**:
   - typed table row aliases
   - typed insert/update payloads
   - remove `(supabase as any)`
3. **Keep admin/facility as explicit follow-on scope unless requested** to avoid Phase 4B sprawl.
4. **Add one incremental validation step per tab migration** (lint + tests + build) to keep changes reviewable.

## Exit criteria proposal for Phase 4B

Phase 4B should be considered complete when:
- no `(supabase as any)` remains in active office workflows,
- office tabs use typed Supabase query/insert/update patterns,
- test/build remain green,
- any deferred surfaces (admin/facility) are explicitly recorded as Phase 4C or later.


## Progress update

- ✅ Office workflow typing hardening completed for:
  - `src/components/office/EstimatesTab.tsx`
  - `src/components/office/PickupRequestsTab.tsx`
  - `src/components/office/InvoicesTab.tsx`
  - `src/components/office/ClientsTab.tsx` (removed residual cast usage)
- ✅ `(supabase as any)` has been removed from `src/components/office/*`.
- ⏭️ Facility casting cleanup remains deferred for a later phase to keep 4B scope contained.
