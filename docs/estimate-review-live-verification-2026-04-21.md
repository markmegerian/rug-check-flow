# Estimate Review Live Verification - 2026-04-21

## Verified live

After applying the estimate review migrations live, the following remote migration history entries are present:

- `20260421050000 | 20260421050000 | 2026-04-21 05:00:00`
- `20260421051500 | 20260421051500 | 2026-04-21 05:15:00`
- `20260421053000 | 20260421053000 | 2026-04-21 05:30:00`

## RPC probe results

Using the live project REST RPC endpoint with the current publishable/anon path:

- `mark_estimate_group_ready([])` → callable, returned `[{"updated_count":0}]`
- `expire_estimate_group([])` → callable, returned `[{"updated_count":0}]`
- `get_estimate_review_groups()` → failed under anon with:
  - `401`
  - `permission denied for table company_memberships`

## Interpretation

This does **not** justify a blind `security definer` rewrite.

The grouped review summary path currently derives company context through tables that are not visible to the anon/publishable context used for the direct probe. That mirrors the earlier Delivery Prep verification pattern: the live probe is useful to expose trust-boundary reality, but the correct response is to align the function with the intended authenticated office runtime rather than weakening boundaries casually.

## Current truth

- The new grouped estimate action primitives are live and callable.
- The grouped summary RPC exists live but still has a trust-boundary mismatch for anon probing because of its current company-name derivation path.
- The safest next step is to either:
  1. simplify the summary RPC so it avoids restricted joins, or
  2. verify and consume it only in the authenticated office context if that is the intended trust boundary.
