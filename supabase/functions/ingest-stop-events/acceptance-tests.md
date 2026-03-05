# Acceptance Tests for ingest-stop-events Edge Function

## Test Setup

These tests require:
1. A test database with PR-1 migration applied
2. Test users with roles: driver, admin, office
3. Test route stops with assigned drivers
4. Test route stop items

## Test Cases

### Test 1: Idempotency - Replaying Same Events

**Goal:** Verify that replaying the same events returns success without duplicating state changes.

**Steps:**
1. Create a route stop with status 'queued'
2. Send event: `STOP_STARTED` with `offline_event_id = "test-1"`
3. Verify stop status is 'in_progress' and `started_at` is set
4. Send the same event again with same `offline_event_id`
5. Verify:
   - Function returns success
   - Stop status remains 'in_progress' (not changed again)
   - Only one event record exists in `route_stop_events`
   - `started_at` was not updated again

**Expected Result:** ✅ Success, no duplicate state changes

---

### Test 2: STOP_COMPLETED Fails Without Signature

**Goal:** Verify that STOP_COMPLETED fails with 409 if signature is missing.

**Steps:**
1. Create a route stop with status 'in_progress', no signature
2. Add route stop items, all verified
3. Send event: `STOP_COMPLETED` with `offline_event_id = "test-2"`
4. Verify:
   - Function returns 409 status
   - Error message indicates signature is required
   - Stop status remains 'in_progress'
   - Event is recorded in `route_stop_events`

**Expected Result:** ✅ 409 error, signature required

---

### Test 3: STOP_COMPLETED Fails With Pending Items

**Goal:** Verify that STOP_COMPLETED fails with 409 if pending items remain.

**Steps:**
1. Create a route stop with status 'in_progress', with signature
2. Add route stop items: some verified, some pending
3. Send event: `STOP_COMPLETED` with `offline_event_id = "test-3"`
4. Verify:
   - Function returns 409 status
   - Error message indicates pending items must be resolved
   - Error includes `pending_items` array
   - Stop status remains 'in_progress'

**Expected Result:** ✅ 409 error, pending items listed

---

### Test 4: STOP_COMPLETED Succeeds With All Items Verified

**Goal:** Verify that STOP_COMPLETED succeeds when all invariants are met.

**Steps:**
1. Create a route stop with status 'in_progress', with signature
2. Add route stop items, all verified
3. Send event: `STOP_COMPLETED` with `offline_event_id = "test-4"`
4. Verify:
   - Function returns 200 status
   - Stop status is 'completed'
   - `completed_at` is set
   - Event is recorded

**Expected Result:** ✅ Success, stop completed

---

### Test 5: STOP_COMPLETED Succeeds With Exceptions

**Goal:** Verify that STOP_COMPLETED succeeds with 'completed_with_exceptions' when items have disputes/exceptions.

**Steps:**
1. Create a route stop with status 'in_progress', with signature
2. Add route stop items: some verified, one disputed
3. Send event: `STOP_COMPLETED` with `offline_event_id = "test-5"`
4. Verify:
   - Function returns 200 status
   - Stop status is 'completed_with_exceptions'
   - `completed_at` is set

**Expected Result:** ✅ Success, stop completed with exceptions

---

### Test 6: Batch Processing

**Goal:** Verify that multiple events can be processed in a single request.

**Steps:**
1. Create a route stop with status 'queued'
2. Send batch of events:
   - `STOP_STARTED` with `offline_event_id = "test-6a"`
   - `ITEM_VERIFIED` with `offline_event_id = "test-6b"`
   - `SIGNATURE_SET` with `offline_event_id = "test-6c"`
3. Verify:
   - Function returns 200 status
   - All events are processed
   - Stop status is 'in_progress'
   - Item is verified
   - Signature is set

**Expected Result:** ✅ All events processed successfully

---

### Test 7: Driver Authorization

**Goal:** Verify that drivers can only process events for stops assigned to them.

**Steps:**
1. Create two route stops:
   - Stop A: assigned to driver-1
   - Stop B: assigned to driver-2
2. As driver-1, send event for Stop A
3. Verify: ✅ Success
4. As driver-1, send event for Stop B
5. Verify: ❌ 403 Forbidden

**Expected Result:** ✅ Driver can only process assigned stops

---

### Test 8: Internal Role Authorization

**Goal:** Verify that admin/office/checkin_staff can process events for any stop.

**Steps:**
1. Create a route stop assigned to driver-1
2. As admin user, send event for the stop
3. Verify: ✅ Success
4. As office user, send event for the stop
5. Verify: ✅ Success

**Expected Result:** ✅ Internal roles can process any stop

---

### Test 9: ITEM_DISPUTED Creates Dispute Record

**Goal:** Verify that ITEM_DISPUTED creates a dispute record and updates item status.

**Steps:**
1. Create a route stop with items
2. Get a route stop item with rug_id
3. Send event: `ITEM_DISPUTED` with:
   - `route_stop_item_id`
   - `dispute_type = "refused_delivery"`
   - `notes = "Customer refused"`
4. Verify:
   - Item status is 'disputed'
   - Dispute record exists in `disputes` table
   - Dispute has correct `rug_id`, `client_id`, `type`, `status = 'open'`

**Expected Result:** ✅ Dispute created, item status updated

---

### Test 10: Partial Failure Handling

**Goal:** Verify that if some events in a batch fail, others still process.

**Steps:**
1. Create a route stop
2. Send batch of events:
   - Valid `STOP_STARTED` event
   - Invalid `ITEM_VERIFIED` event (missing item_id)
   - Valid `SIGNATURE_SET` event
3. Verify:
   - Function returns 200 (not all failed)
   - Response includes `failed_events: 1`
   - Response includes `errors` array with details
   - Valid events were processed
   - Invalid event was not processed

**Expected Result:** ✅ Partial success, errors reported

---

## Manual Test Script

```bash
# Set environment variables
export SUPABASE_URL="your-supabase-url"
export SUPABASE_ANON_KEY="your-anon-key"
export DRIVER_TOKEN="driver-auth-token"
export ADMIN_TOKEN="admin-auth-token"

# Test 1: Idempotency
curl -X POST "${SUPABASE_URL}/functions/v1/ingest-stop-events" \
  -H "Authorization: Bearer ${DRIVER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "offline_event_id": "test-1",
      "route_stop_id": "stop-id-here",
      "event_type": "STOP_STARTED",
      "payload": {}
    }]
  }'

# Test 2: STOP_COMPLETED without signature
curl -X POST "${SUPABASE_URL}/functions/v1/ingest-stop-events" \
  -H "Authorization: Bearer ${DRIVER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "offline_event_id": "test-2",
      "route_stop_id": "stop-id-here",
      "event_type": "STOP_COMPLETED",
      "payload": {}
    }]
  }'
# Expected: 409 status with error message

# Test 3: STOP_COMPLETED with pending items
# (Similar to Test 2, but with signature set and pending items)

# Test 4: Successful completion
curl -X POST "${SUPABASE_URL}/functions/v1/ingest-stop-events" \
  -H "Authorization: Bearer ${DRIVER_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "events": [{
      "offline_event_id": "test-4",
      "route_stop_id": "stop-id-here",
      "event_type": "STOP_COMPLETED",
      "payload": {}
    }]
  }'
# Expected: 200 status, stop completed
```

## Automated Test Notes

For automated testing, consider:
1. Using Supabase test client
2. Creating test fixtures (stops, items, users)
3. Cleaning up test data after each test
4. Using unique `offline_event_id` values per test run
