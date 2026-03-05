# Deployment Checklist: PR-1 through PR-4

**Date:** 2026-03-05  
**Status:** Ready for Deployment  
**Commit:** `dd7893b`

## Pre-Deployment

- [x] All code committed and merged to main
- [x] Frontend builds successfully (`npm run build`)
- [x] Linting passes (`npm run lint`)
- [x] Dependencies installed (`npm install` - dexie added)
- [x] App.tsx updated with OfflineQueueProvider
- [x] Driver route updated to use StopPortal
- [x] Supabase config.toml updated for ingest-stop-events

## Deployment Steps

### 1. Database Migrations (CRITICAL - Do First)

**Location:** Supabase Dashboard → SQL Editor

**Execute in order:**

1. **PR-1 Migration** (`supabase/migrations/20260305000000_add_route_stops_unified_model.sql`)
   - Creates: route_stops, route_stop_items, route_stop_events, disputes tables
   - Creates: enums (route_stop_status, route_stop_phase, etc.)
   - Creates: triggers and state machine functions
   - Creates: build_route_stops_for_date() function
   - Sets up: RLS policies
   - **Time:** ~30 seconds
   - **Verify:** Check that all tables exist in Table Editor

2. **PR-4 RLS Migration** (`supabase/migrations/20260305000002_update_delivery_list_items_rls.sql`)
   - Updates: delivery_list_items RLS policies
   - Creates: trigger to block drivers from updating confirmed_for_delivery
   - **Time:** ~5 seconds
   - **Verify:** Check policies in Authentication → Policies

**After migrations:**
- [ ] Run acceptance tests: `supabase/migrations/20260305000001_route_stops_acceptance_tests.sql`
- [ ] Verify no errors in Supabase logs

### 2. Edge Function Deployment

**Location:** Supabase Dashboard → Edge Functions

**Function:** `ingest-stop-events`

**Steps:**
1. Click "Create a new function"
2. Name: `ingest-stop-events`
3. Copy entire contents from: `supabase/functions/ingest-stop-events/index.ts`
4. Paste into function editor
5. Click "Deploy"

**Verify:**
- [ ] Function appears in Edge Functions list
- [ ] Function shows as "Active"
- [ ] No deployment errors

**Test:**
```bash
curl -X POST "https://toitgmaeuscrdwbpntda.supabase.co/functions/v1/ingest-stop-events" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"events": []}'
```

Should return 400 (events array empty) - this confirms function is deployed.

### 3. Frontend Deployment

**Build:**
```bash
npm run build
```

**Deploy:**
- Deploy `dist/` folder to your hosting platform
- Or test locally with `npm run dev`

**Verify:**
- [ ] App loads without errors
- [ ] No console errors
- [ ] Driver route shows StopPortal (not DriverPortal)
- [ ] Facility Ops shows "Delivery Prep" tab

### 4. Post-Deployment Verification

#### Database Verification
- [ ] `route_stops` table exists and is queryable
- [ ] `route_stop_items` table exists
- [ ] `route_stop_events` table exists
- [ ] `disputes` table exists
- [ ] All enums visible in Database → Types
- [ ] `build_route_stops_for_date()` function exists

#### RLS Verification
- [ ] Driver user can SELECT route_stops assigned to them
- [ ] Driver user CANNOT UPDATE route_stops directly
- [ ] Driver user CAN INSERT route_stop_events
- [ ] Check-in staff CAN update confirmed_for_delivery
- [ ] Driver CANNOT update confirmed_for_delivery (should error)
- [ ] Driver CAN update loaded_on_truck

#### Edge Function Verification
- [ ] Function responds to requests
- [ ] Function validates authentication
- [ ] Function processes events correctly
- [ ] Function handles idempotency (duplicate events)

#### Frontend Verification
- [ ] StopPortal loads for driver users
- [ ] Stops appear in queued/in_progress/completed buckets
- [ ] Delivery items shown before pickup items
- [ ] Signature component works
- [ ] Offline queue works (test in airplane mode)
- [ ] Events sync when online
- [ ] Delivery Prep tab visible to check-in staff
- [ ] Finalize Truck button appears for delivery stops

### 5. Functional Testing

#### Test 1: Check-In Staff - Day-Before Confirmation
1. Login as checkin_staff user
2. Navigate to Facility Ops → Delivery Prep
3. See tomorrow's delivery items
4. Toggle confirmed_for_delivery for ready rugs
5. Verify confirmation persists

#### Test 2: Driver - Stop Execution
1. Login as driver user
2. Navigate to Driver portal
3. See assigned stops
4. Start a stop
5. Verify delivery items
6. Verify pickup items
7. Add signature
8. Complete stop
9. Verify stop becomes completed

#### Test 3: Driver - Offline Operation
1. Login as driver user
2. Put device in airplane mode
3. Start stop, verify items, add signature
4. Complete stop
5. Go online
6. Verify events sync
7. Verify stop becomes completed on server

#### Test 4: Driver - Finalize Truck
1. Login as driver user
2. Open stop with delivery items
3. Verify all delivery items (auto-sets loaded_on_truck)
4. Click "Finalize Truck"
5. Verify invoices are created
6. Verify delivery list marked as checked_out

#### Test 5: RLS Enforcement
1. Login as driver user
2. Try to update confirmed_for_delivery directly
3. Verify error: "Drivers cannot update confirmed_for_delivery"
4. Verify driver CAN update loaded_on_truck

### 6. Smoke Tests

Run the existing smoke test scripts:

```bash
# Staging smoke test
./scripts/staging-smoke-test.sh

# RLS scope smoke test
./scripts/rls-scope-smoke-test.sh
```

## Rollback Plan

If critical issues are found:

1. **Rollback Frontend:**
   - Revert App.tsx to use DriverPortal
   - Remove OfflineQueueProvider wrapper
   - Redeploy frontend

2. **Rollback Edge Function:**
   - Delete `ingest-stop-events` function from dashboard

3. **Rollback Migrations:**
   - Execute rollback SQL (see PR-1 summary)
   - Restore old RLS policies

## Known Issues / Notes

- DriverPortal still exists as fallback (can revert route if needed)
- Old pickup_requests and delivery_lists flows remain operational
- Stops are generated from existing sources (additive, not breaking)

## Next Steps After Successful Deployment

1. Monitor error logs for 24-48 hours
2. Test with real users (check-in staff, drivers)
3. Gather feedback on new workflows
4. Fix any issues found
5. Proceed to PR-5 through PR-16

## Support

If deployment issues arise:
- Check Supabase Dashboard → Logs for errors
- Verify environment variables are set
- Check RLS policies are active
- Review migration execution logs
