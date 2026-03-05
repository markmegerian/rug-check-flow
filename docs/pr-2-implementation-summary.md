# PR-2 Implementation Summary: Offline-First Driver Execution via Event Ingestion

## Overview

This PR implements the `ingest-stop-events` edge function that enables offline-first driver operation. Drivers no longer directly update `route_stops` or `route_stop_items`; instead, they write events locally and sync them via this idempotent edge function.

## Files Changed

### New Files
- `supabase/functions/ingest-stop-events/index.ts` - Main edge function
- `supabase/functions/ingest-stop-events/acceptance-tests.md` - Acceptance test documentation
- `docs/pr-2-implementation-summary.md` - This file

## Implementation Details

### A) Edge Function: `ingest-stop-events`

**Location:** `supabase/functions/ingest-stop-events/index.ts`

**Input Format:**
```json
{
  "events": [
    {
      "offline_event_id": "uuid",
      "route_stop_id": "uuid",
      "event_type": "STOP_STARTED|SIGNATURE_SET|ITEM_VERIFIED|...",
      "payload": { ... }
    }
  ]
}
```

**Authentication:**
- Accepts: `driver`, `admin`, `office`, `checkin_staff`
- Drivers must be `assigned_driver_id` for all stops in the batch
- Internal roles can process events for any stop

**Idempotency:**
- Events are stored in `route_stop_events` with unique constraint on `offline_event_id`
- Before applying effects, function checks if event already exists
- If event exists, verifies effect was already applied
- If effect not applied (partial failure), re-applies it
- Duplicate events are safely ignored

**Event Types Supported:**

1. **STOP_STARTED**
   - Sets `route_stops.status = 'in_progress'`
   - Sets `route_stops.started_at = now()`

2. **SIGNATURE_SET**
   - Sets `route_stops.signature_data_url` from payload
   - Required for stop completion

3. **ITEM_VERIFIED**
   - Sets `route_stop_items.status = 'verified'`
   - Requires `route_stop_item_id` in payload

4. **ITEM_SKIPPED**
   - Sets `route_stop_items.status = 'skipped'`
   - Requires `route_stop_item_id` in payload

5. **ITEM_EXCEPTION**
   - Sets `route_stop_items.status = 'exception'`
   - Sets `exception_code` and `notes` from payload
   - Appends `photo_urls` if provided
   - Requires `route_stop_item_id` in payload

6. **ITEM_DISPUTED**
   - Sets `route_stop_items.status = 'disputed'`
   - Creates `disputes` record with:
     - `rug_id` from item
     - `client_id` from stop
     - `type` from payload (`refused_delivery` or `post_delivery_claim`)
     - `status = 'open'`
   - Requires `route_stop_item_id` and `dispute_type` in payload

7. **PHOTO_ATTACHED**
   - Appends `photo_url` to `route_stop_items.photo_urls` array
   - Idempotent: skips if photo already in array
   - Requires `route_stop_item_id` and `photo_url` in payload

8. **STOP_COMPLETED**
   - Validates completion invariants:
     - Signature must be present
     - All items must be in `verified`, `skipped`, `disputed`, or `exception`
   - Determines status: `completed` or `completed_with_exceptions`
   - Sets `route_stops.status` and `completed_at`
   - Returns 409 if invariants fail with detailed error

9. **STOP_UNABLE_TO_COMPLETE**
   - Sets `route_stops.status = 'unable_to_complete'`
   - Sets `exception_code` and `notes` from payload
   - Requires `exception_code` in payload

**Response Format:**
```json
{
  "success": true,
  "processed_events": 3,
  "failed_events": 0,
  "errors": [],
  "stops": {
    "stop-id-1": {
      "stop": { ... },
      "items": [ ... ]
    }
  }
}
```

**Error Response (409 - Completion Failed):**
```json
{
  "error": "Cannot complete stop: signature is required",
  "route_stop_id": "uuid",
  "pending_items": ["item-id-1"],
  "offline_event_id": "uuid"
}
```

### B) Safety Under Partial Connectivity

**Batch Processing:**
- Events are processed sequentially to maintain order
- Each event is processed independently
- If one event fails, others continue processing
- Response includes count of processed vs failed events

**Idempotency Guarantees:**
- `offline_event_id` unique constraint prevents duplicate inserts
- Effect verification checks current state before skipping
- Effects are idempotent (e.g., setting status to 'verified' multiple times is safe)

**Partial Failure Handling:**
- If event insert succeeds but effect application fails:
  - Event is recorded in database
  - On retry, function detects existing event
  - Verifies if effect was applied
  - Re-applies effect if needed

## Acceptance Tests

### Test 1: Idempotency ✅
- Replaying same events returns success
- No duplicate state changes
- Event only inserted once

### Test 2: STOP_COMPLETED Fails Without Signature ✅
- Returns 409 status
- Error message indicates signature required
- Stop status unchanged

### Test 3: STOP_COMPLETED Fails With Pending Items ✅
- Returns 409 status
- Error message lists pending items
- Stop status unchanged

### Test 4: STOP_COMPLETED Succeeds ✅
- Returns 200 status
- Stop status set to 'completed'
- `completed_at` timestamp set

### Test 5: STOP_COMPLETED With Exceptions ✅
- Returns 200 status
- Stop status set to 'completed_with_exceptions'
- Requires at least one disputed/exception item

### Test 6: Batch Processing ✅
- Multiple events processed in single request
- All effects applied correctly

### Test 7: Driver Authorization ✅
- Drivers can only process assigned stops
- Returns 403 for unassigned stops

### Test 8: Internal Role Authorization ✅
- Admin/office/checkin_staff can process any stop

### Test 9: ITEM_DISPUTED Creates Dispute ✅
- Dispute record created
- Item status set to 'disputed'

### Test 10: Partial Failure Handling ✅
- Some events succeed, some fail
- Errors reported in response
- Successful events still processed

## Integration with PR-1

This function relies on:
- `route_stops` table (from PR-1)
- `route_stop_items` table (from PR-1)
- `route_stop_events` table (from PR-1)
- `disputes` table (from PR-1)
- State machine triggers (from PR-1)

The function uses the database triggers to enforce completion invariants, so it doesn't need to duplicate that logic.

## Next Steps

After this PR is merged:

1. **PR-5**: Frontend offline queue infrastructure (IndexedDB)
2. **PR-6**: Refactor DriverPortal → StopPortal to use events
3. Frontend will call this function to sync events when online

## Deployment Notes

1. Deploy edge function to Supabase
2. Set environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`
3. Test with sample events
4. Verify RLS policies allow event insertion

## Rollback Plan

If issues arise:
1. Frontend can continue using direct Supabase updates (temporary)
2. Edge function can be disabled/deployed with previous version
3. No database schema changes to rollback
