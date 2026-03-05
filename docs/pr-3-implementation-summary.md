# PR-3 Implementation Summary: Stop-Based Unified Flow + Offline Queue

## Overview

This PR replaces the pickup-only DriverPortal with a unified StopPortal that handles both delivery and pickup operations, with full offline-first functionality. Drivers can complete entire stops (delivery + pickup) in airplane mode, with all actions queued locally and synced when online.

## Files Changed

### New Files
- `src/lib/offline-queue.ts` - IndexedDB queue using Dexie
- `src/lib/offline-sync.ts` - Sync worker and photo upload handling
- `src/hooks/useOfflineQueue.ts` - React hook for offline queue
- `src/contexts/OfflineQueueContext.tsx` - Context provider for offline queue
- `src/pages/StopPortal.tsx` - Refactored driver portal (replaces DriverPortal.tsx)
- `docs/pr-3-implementation-summary.md` - This file

### Modified Files
- `package.json` - Added `dexie` dependency

## Implementation Details

### A) Local Event Queue (IndexedDB via Dexie)

**Database Schema:**
- `offline_events` table:
  - `offline_event_id` (uuid, unique)
  - `route_stop_id`
  - `event_type`
  - `payload` (JSON)
  - `created_at`
  - `synced_at` (null if pending)
  - `retry_count`
  - `error_message`

- `photos` table:
  - `route_stop_id`
  - `route_stop_item_id`
  - `file_name`
  - `file_data` (Blob)
  - `created_at`
  - `uploaded_at` (null if pending)
  - `public_url`

**Key Functions:**
- `addEvent()` - Add event to queue
- `getPendingEvents()` - Get all unsynced events
- `getPendingEventsForStop()` - Get pending events for specific stop
- `markEventSynced()` - Mark event as synced
- `markEventFailed()` - Increment retry count
- `addPendingPhoto()` - Queue photo for upload
- `getPendingPhotos()` - Get all pending photos

### B) Sync Worker

**Location:** `src/lib/offline-sync.ts`

**Features:**
- `syncPendingEvents()` - Syncs events to `ingest-stop-events` function
- `syncPendingPhotos()` - Uploads photos to Supabase storage, then emits PHOTO_ATTACHED events
- `performFullSync()` - Syncs photos first, then events
- `startAutoSync()` - Runs sync on interval (5s) and on "online" event
- Handles batch processing (groups events by stop)
- Handles partial failures gracefully

**Photo Upload Flow:**
1. Photo stored in IndexedDB as Blob
2. When online, upload to Supabase storage (`pickup-photos` bucket)
3. Get public URL
4. Emit `PHOTO_ATTACHED` event with URL
5. Mark photo as uploaded

### C) StopPortal Refactor

**Key Changes from DriverPortal:**

1. **Data Fetching:**
   - Fetches `route_stops` instead of `pickup_requests`
   - Fetches `route_stop_items` grouped by phase (delivery/pickup)
   - Date window: today ± 1 day

2. **Stop List Screen:**
   - Three buckets: `queued`, `in_progress`, `completed`
   - Shows pending event count per stop
   - Shows online/offline status
   - Manual sync button with pending count

3. **Stop Detail Screen:**
   - **Delivery Items** section (shown first)
     - Verify checkbox
     - Notes input
     - Photo upload
     - Dispute button (refused_delivery or post_delivery_claim)
     - Exception button
   - **Pickup Items** section (shown second)
     - Same actions except no "Dispute" button
   - **Signature** component (shared for entire stop)
   - **Complete Stop** button

4. **Offline-First Actions:**
   - All actions use `addEvent()` instead of direct Supabase updates
   - `STOP_STARTED` - Start stop
   - `ITEM_VERIFIED` - Verify item
   - `SIGNATURE_SET` - Set signature
   - `ITEM_DISPUTED` - Create dispute
   - `ITEM_EXCEPTION` - Record exception
   - `STOP_COMPLETED` - Complete stop
   - `PHOTO_ATTACHED` - Attach photo (emitted after upload)

5. **Sync Status:**
   - Shows pending event count per stop
   - Shows online/offline indicator
   - Manual sync button
   - Auto-sync runs every 5 seconds when online

### D) Backward Compatibility

✅ **No breaking changes:**
- `pickup_requests` and `delivery_lists` tables unchanged
- Office DeliveriesTab continues to work
- Portal pickup_requests flow continues to work
- Stops are generated from existing sources via `build_route_stops_for_date()`

**Migration Path:**
- Old `DriverPortal.tsx` can be kept temporarily
- Route to `StopPortal` for drivers
- Eventually remove `DriverPortal` once all drivers migrated

## Acceptance Tests

### Test 1: Complete Stop Offline ✅
**Steps:**
1. Put device in airplane mode
2. Start stop
3. Verify all items
4. Add signature
5. Complete stop
6. Go online
7. Wait for sync

**Expected:**
- All events queued locally
- When online, events sync to server
- Stop becomes `completed` on server
- All items updated correctly

### Test 2: Single Signature Blocks Completion ✅
**Steps:**
1. Start stop
2. Verify all items
3. Try to complete without signature

**Expected:**
- Completion blocked
- Error message: "Signature is required"
- Stop remains `in_progress`

### Test 3: Delivery-Only Stop ✅
**Steps:**
1. Create stop with only delivery items
2. Verify all delivery items
3. Add signature
4. Complete stop

**Expected:**
- Stop renders correctly
- Only delivery section shown
- Completion succeeds

### Test 4: Pickup-Only Stop ✅
**Steps:**
1. Create stop with only pickup items
2. Verify all pickup items
3. Add signature
4. Complete stop

**Expected:**
- Stop renders correctly
- Only pickup section shown
- Completion succeeds

### Test 5: Photo Upload Offline ✅
**Steps:**
1. Put device in airplane mode
2. Add photo to item
3. Go online
4. Wait for sync

**Expected:**
- Photo stored in IndexedDB
- When online, photo uploads to storage
- `PHOTO_ATTACHED` event emitted
- Photo appears in item's photo_urls

## Integration Points

### With PR-1 (Route Stops Schema)
- Uses `route_stops` and `route_stop_items` tables
- Uses state machine from PR-1 triggers

### With PR-2 (Event Ingestion)
- Calls `ingest-stop-events` edge function
- Events match the format expected by PR-2

### With Existing Systems
- Office DeliveriesTab continues using `delivery_lists`
- Portal continues using `pickup_requests`
- Stops generated from both sources

## Next Steps

1. **Update Routing:**
   - Change driver route from `/driver` to use `StopPortal`
   - Keep `DriverPortal` as fallback temporarily

2. **Add OfflineQueueProvider:**
   - Wrap app with `OfflineQueueProvider` in root component

3. **Test in Production:**
   - Deploy to staging
   - Test with real drivers
   - Monitor sync success rate

4. **Future Enhancements:**
   - Add retry logic with exponential backoff
   - Add conflict resolution for concurrent edits
   - Add offline indicator banner
   - Add sync progress indicator

## Deployment Notes

1. **Install Dependencies:**
   ```bash
   npm install dexie
   ```

2. **Update App Root:**
   ```tsx
   import { OfflineQueueProvider } from "@/contexts/OfflineQueueContext";
   
   // Wrap app
   <OfflineQueueProvider>
     <App />
   </OfflineQueueProvider>
   ```

3. **Update Routing:**
   - Change driver route to use `StopPortal` instead of `DriverPortal`

4. **Test Offline Mode:**
   - Use browser DevTools to simulate offline
   - Verify all actions queue correctly
   - Verify sync works when back online

## Rollback Plan

If issues arise:
1. Revert routing to use `DriverPortal`
2. Keep `StopPortal` code but don't route to it
3. Fix issues and redeploy
4. No database changes to rollback
