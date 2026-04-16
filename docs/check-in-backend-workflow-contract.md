# Check-In Backend Workflow Contract

_Last updated: 2026-04-16_

## Why this exists

The current Check-In flow in `src/components/facility/CheckInLayout.tsx` still orchestrates too much work in the frontend.

That was acceptable for near-term stabilization, but it is the wrong long-term shape.

The goal of this contract is to move the authoritative Check-In workflow into a dedicated backend endpoint so the frontend becomes a thin client.

## Current reality

Today the frontend is still responsible for most of this:
- resolve/fallback client ID by client name
- create `intake_jobs` row when available
- create `rugs` row with schema fallback behavior
- delete and recreate `rug_services` on edit
- upload check-in photos and persist `checkin_photos`
- patch `rugs.photo_url`
- link pickup items to checked-in rugs
- auto-advance rug stage
- auto-create estimate drafts when eligible
- append same-tag continuity notes
- log continuity / estimate communication events

Some of that work is already partially deferred or parallelized, but the orchestration is still frontend-owned.

## Target shape

Add a dedicated backend workflow endpoint.

Recommended implementation:
- Supabase Edge Function
- name: `check-in-workflow`

Initial implementation now exists at:
- `supabase/functions/check-in-workflow/index.ts`

The frontend should submit a single workflow request and receive a structured result.

## Scope

This endpoint must support both:
- create check-in
- edit existing check-in

## Request contract

```ts
interface CheckInWorkflowRequest {
  mode: "create" | "edit";
  rugId?: string; // required for edit, absent for create
  sourceRugId?: string | null; // pickup_request_items id or walk-in temp id from UI context
  actorUserId: string | null;
  clientId?: string | null;
  clientName: string;
  rugNumber: string;
  rugType: string;
  length: number;
  width: number;
  conditionNotes: string;
  source: "pickup" | "dropoff";
  intakeDate?: string; // optional override, default now()
  services: Array<{
    service_id: string;
    service_name: string;
    unit_price: number;
    line_total: number;
    edges: string[];
  }>;
  photos?: Array<{
    storage_path: string;
    public_url?: string | null;
  }>;
}
```

## Response contract

```ts
interface CheckInWorkflowResponse {
  status: "success" | "warning" | "error";
  rugId?: string;
  intakeJobId?: string | null;
  estimateId?: string | null;
  estimateNumber?: string | null;
  warnings: string[];
  resetForm: boolean; // frontend should fully reset when true
  summary: {
    rugNumber: string;
    clientName: string;
    checkedInAt: string;
    totalPrice: number;
  };
}
```

## Required synchronous behavior

These steps must complete before the endpoint returns `success`:

### Create mode
1. Resolve `clientId` if missing and a matching client can be found.
2. Attempt `intake_jobs` insert when that table exists.
3. Insert rug row.
   - if extended intake columns exist, write them
   - otherwise fall back cleanly without failing the workflow
4. Insert `rug_services` rows.
   - cleaning services default to `approved`
   - non-cleaning services default to `pending`
5. Persist `checkin_photos` metadata for any provided photos.
6. Advance rug stage out of `checked_in`.
7. If selected services require an estimate and are not cleaning-only, create draft estimate + estimate items.

### Edit mode
1. Update rug row.
2. Replace rug services safely.
3. Persist any new `checkin_photos` metadata.

## Allowed asynchronous side effects

These may happen after the endpoint returns success, as long as failures are logged and do not corrupt the primary workflow:
- patch `rugs.photo_url`
- link `pickup_request_items.checked_in_rug_id`
- write `communication_events`
- queue estimate batch send cadence
- same-tag continuity lookup and continuity note append

## Hard rules

### 1) Primary success must mean the rug is truly checked in
Do not return success before the core rug + rug service state is durable.

### 2) Cleaning-only check-ins must not create or queue estimates
If every selected service is a cleaning-category service, no estimate should be created.

### 3) Cleaning services default approved
This must be enforced centrally in the backend workflow, not trusted from the client.

### 4) Frontend must not decide authoritative approval defaults
The request may include service pricing context, but approval behavior must be derived server-side.

### 5) Endpoint must be idempotency-ready
Add support for an idempotency key before rollout to production-heavy usage.

Recommended request header:
- `x-idempotency-key`

Minimum idempotency behavior:
- same actor + same key + same mode should not create duplicate rugs or duplicate estimates

### 6) Warning-grade failures must be explicit
If non-critical side effects fail, return `status: "warning"` and include machine-readable warnings later if needed.

## Transaction boundary recommendation

If implemented in Edge Functions with direct DB calls:
- move core writes into a database RPC when practical
- keep optional side effects in the Edge Function layer

Best split:
- **DB transaction / RPC**
  - create or update rug
  - create or replace rug services
  - create intake job when available
  - create estimate + estimate items when eligible
  - stage advance
- **Edge Function orchestration**
  - photo metadata ingestion
  - pickup item linking
  - continuity lookup
  - event logging
  - queue handoff

## Frontend contract after backend rollout

After this endpoint exists, `CheckInLayout.tsx` should stop doing direct write orchestration.

Frontend responsibilities should be reduced to:
- collect validated form data
- upload raw photo files if needed
- submit a single `check-in-workflow` request
- render success / warning / error state
- reset UI when `resetForm === true`

## Migration / rollout plan

### Phase 1
- define and commit this contract
- keep current frontend flow live

### Phase 2
- implement `check-in-workflow` Edge Function ✅
- keep frontend behind a feature flag or fallback path

### Phase 3
- switch Check-In UI to backend-owned workflow
- retain fallback only briefly if needed

### Phase 4
- remove obsolete frontend orchestration from `CheckInLayout.tsx`

## Files that should change in the implementation phase

Expected future implementation touchpoints:
- `supabase/functions/check-in-workflow/index.ts`
- optional DB RPC / migration for transactional core write path
- `src/components/facility/CheckInLayout.tsx`
- `src/lib/checkin-operations.ts`
- `src/lib/rug-service-approval.ts`

## Non-goals

This contract does not define:
- UI layout changes
- left rail / top tab bar decisions
- Check-In history behavior
- delivery workflow changes

Those are separate concerns.
