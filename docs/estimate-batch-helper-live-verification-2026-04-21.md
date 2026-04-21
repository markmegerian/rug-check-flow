# Estimate Batch Helper Live Verification - 2026-04-21

## Scope

Live verification of the current estimate batch queue/send helper stack on the correct linked Supabase project:
- project id: `toitgmaeuscrdwbpntda`

## Verified live results

### Migration state
Verified via `supabase migration list --linked`.
The remote project includes all relevant estimate batch migrations through:
- `20260421071500`
- `20260421073000`
- `20260421133500`
- `20260421134500`
- `20260421135000`
- `20260421135500`

### Browser/publishable-key RPC probes
Using the repo-local publishable key from `.env.example`:

#### `queue_estimate_group_batch([])`
- HTTP `200`
- response: `[{"queued_count":0}]`
- judgment: **healthy**

#### `get_estimate_send_batch_summaries()`
- HTTP `200`
- response: `[]`
- judgment: **healthy**

#### `ensure_estimate_send_batch(...)`
- HTTP `401`
- response:
  - `{"code":"42501","details":null,"hint":null,"message":"permission denied for function ensure_estimate_send_batch_internal"}`
- judgment: **still not browser-usable**

## Interpretation

This confirms the current system boundary clearly:

1. **The real browser queue path is working**
   - grouped queueing via `queue_estimate_group_batch(...)` is healthy
   - batch summary reading via `get_estimate_send_batch_summaries()` is healthy

2. **The remaining failing piece is only the direct helper path**
   - `ensure_estimate_send_batch(...)` still fails in publishable/authenticated-style REST use because the wrapper ultimately hits `ensure_estimate_send_batch_internal(...)` across a permission boundary

3. **This is not a blocking app regression**
   - the frontend no longer depends on direct helper calls
   - the app-side safe rollback to backend-only queue primitive was the correct move

## Product/engineering judgment

The correct next step is **not** to make browser helper calls work at any cost.

The correct next step is to:
- treat `ensure_estimate_send_batch(...)` as backend/internal infrastructure only, and
- either remove/supersede the misleading authenticated/browser grant path later or leave it internal without encouraging frontend use.

## Current truth after verification

- Browser queue/send review path: **healthy**
- Browser batch summary visibility: **healthy**
- Direct browser helper call to `ensure_estimate_send_batch(...)`: **not healthy, but no longer part of the intended frontend path**
- No immediate frontend fix is required from this verification alone.
