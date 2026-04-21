# Estimate Review Live Verification - 2026-04-21

## Verified live

After applying the estimate review migrations live, the following remote migration history entries are present:

- `20260421050000 | 20260421050000 | 2026-04-21 05:00:00`
- `20260421051500 | 20260421051500 | 2026-04-21 05:15:00`
- `20260421053000 | 20260421053000 | 2026-04-21 05:30:00`
- `20260421054500 | 20260421054500 | 2026-04-21 05:45:00`
- `20260421060000 | 20260421060000 | 2026-04-21 06:00:00`

## RPC probe results

Using the live project REST RPC endpoint with the current publishable/anon path:

- `mark_estimate_group_ready([])` → callable, returned `[{"updated_count":0}]`
- `expire_estimate_group([])` → callable, returned `[{"updated_count":0}]`
- initial `get_estimate_review_groups()` probe → failed under anon with:
  - `401`
  - `permission denied for table company_memberships`
- after simplification migration `20260421054500`, `get_estimate_review_groups()` → `200 []`
- `get_estimate_group_details('00000000-0000-0000-0000-000000000000', 'needs_office_review')` → `200 []`

## Interpretation

The original grouped review summary path crossed a restricted trust boundary by deriving company context through tables not visible to the anon/publishable probe. That was corrected by simplifying the function rather than weakening the boundary with a blind `security definer` rewrite.

## Current truth

- The grouped estimate action primitives are live and callable.
- The grouped estimate summary RPC is live and callable after simplification.
- The grouped estimate detail RPC is live and callable.
- The Office estimate review surface now has real backend primitives for:
  - grouped summary
  - grouped action mutation
  - grouped detail resolution
