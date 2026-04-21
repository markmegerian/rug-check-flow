# Estimate Batch Helper Restriction Verification - 2026-04-21

## Scope

Verification of follow-up migration:
- `20260421194000_restrict_estimate_send_batch_helper_to_backend.sql`

## Live migration state

Verified with:
- `supabase migration list --linked`

Remote history now includes:
- `20260421194000 | 20260421194000 | 2026-04-21 19:40:00`

## Live behavior after apply

### Browser/publishable-key probe
RPC tested:
- `public.ensure_estimate_send_batch(...)`

Result:
- HTTP `401`
- payload:
  - `{"code":"42501","details":null,"hint":null,"message":"permission denied for function ensure_estimate_send_batch_internal"}`

## Interpretation

This is the expected outcome for the current cleanup direction:
- the helper remains unavailable to browser/publishable-key callers
- the frontend-safe queue path remains the backend-owned primitive `queue_estimate_group_batch(...)`
- the SQL boundary now matches the intended architectural boundary more closely: direct helper calls are backend/service-role territory, not frontend app territory

## Current truth

After the restriction migration:
- browser queueing path remains the intended path
- browser direct helper path remains blocked
- remote migration history now accurately records the cleanup migration as applied

## Follow-up note

The live error message still names `ensure_estimate_send_batch_internal`, which is acceptable for now because the goal was to keep the helper unavailable to browser callers, not to make the browser helper path succeed.
