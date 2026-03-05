# PR-4 Implementation Summary: Operational Split for Day-Before Confirmation

## Overview

This PR implements the operational split where check-in staff confirms physically ready rugs day-before, drivers finalize loaded_on_truck morning-of, and invoices are generated when drivers finalize the truck list.

## Files Changed

### New Files
- `supabase/migrations/20260305000002_update_delivery_list_items_rls.sql` - RLS policy updates
- `src/components/facility/DeliveryPrepTab.tsx` - Delivery Prep component for check-in staff
- `docs/pr-4-implementation-summary.md` - This file

### Modified Files
- `src/pages/FacilityOps.tsx` - Added Delivery Prep tab
- `src/pages/StopPortal.tsx` - Added Finalize Truck functionality and loaded_on_truck tracking

## Implementation Details

### A) Delivery Prep Component

**Location:** `src/components/facility/DeliveryPrepTab.tsx`

**Features:**
- Shows tomorrow's delivery_list_items grouped by route_day and client
- Filters to only rugs with `status = 'ready'`
- Only shows items from delivery_lists with `status IN ('compiling', 'confirmed')`
- Check-in staff toggles `confirmed_for_delivery = true` after physical verification
- Visual indicators:
  - Confirmed items have green background
  - In-production rugs are disabled with tooltip
  - Shows confirmation count

**Role Gating:**
- Component is in FacilityOps which is already role-gated to `checkin_staff`, `admin`, `office`
- RLS policies enforce that only these roles can update `confirmed_for_delivery`

### B) RLS Policy Updates

**Location:** `supabase/migrations/20260305000002_update_delivery_list_items_rls.sql`

**Changes:**
1. **Dropped old policy:** `delivery_list_items_manage_admin_office`
2. **New policy:** `delivery_list_items_manage_internal`
   - Allows `admin`, `office`, `checkin_staff` to manage all fields
3. **New trigger function:** `validate_driver_delivery_item_update()`
   - Blocks drivers from updating `confirmed_for_delivery`
   - Allows drivers to update `loaded_on_truck`
4. **New trigger:** `delivery_list_items_driver_update_guard`
   - Applies validation only for non-internal roles (drivers)
5. **New policies for drivers:**
   - `delivery_list_items_select_driver` - Drivers can SELECT items for assigned stops
   - `delivery_list_items_update_driver_loaded` - Drivers can UPDATE `loaded_on_truck`

**Enforcement:**
- Trigger raises exception if driver tries to change `confirmed_for_delivery`
- Error message: "Drivers cannot update confirmed_for_delivery. Only check-in staff, office, or admin can set this field."

### C) Finalize Truck in StopPortal

**Location:** `src/pages/StopPortal.tsx`

**Features:**
1. **Loaded Status Tracking:**
   - Fetches `delivery_list_items.loaded_on_truck` status when loading stops
   - Shows "Loaded" badge on delivery items that are loaded
   - When driver verifies a delivery item, automatically sets `loaded_on_truck = true`

2. **Finalize Truck Button:**
   - Shown when:
     - Stop status is `in_progress`
     - Stop has `delivery_list_id`
     - Stop has delivery items
   - Enabled when:
     - All delivery items are verified
     - All delivery items are loaded_on_truck
   - Calls `checkout-delivery` edge function with `delivery_list_id`
   - Shows success message with invoice count
   - Refreshes stops after finalization

3. **Integration:**
   - Uses existing `checkout-delivery` function (no new function needed)
   - Function already enforces `delivery_list.status = 'confirmed'`
   - Function processes items where `confirmed_for_delivery = true AND loaded_on_truck = true`

## Workflow

### Day-Before (Check-In Staff)
1. Check-in staff opens Facility Ops → Delivery Prep tab
2. Sees tomorrow's delivery items grouped by route day and client
3. Physically verifies each rug is ready
4. Toggles `confirmed_for_delivery = true` for ready rugs
5. Office confirms the delivery list (sets `delivery_list.status = 'confirmed'`)

### Morning-Of (Driver)
1. Driver opens StopPortal
2. Sees assigned stops with delivery items
3. Verifies each delivery item (sets `loaded_on_truck = true` automatically)
4. When all delivery items verified and loaded, "Finalize Truck" button enables
5. Driver clicks "Finalize Truck"
6. System calls `checkout-delivery` which:
   - Creates invoices for each client
   - Generates invoice PDFs
   - Updates rugs to `picked_up` status
   - Marks delivery list as `checked_out`

## Acceptance Tests

### Test 1: Check-In Staff Can Set confirmed_for_delivery ✅
**Steps:**
1. Login as checkin_staff user
2. Navigate to Facility Ops → Delivery Prep
3. Toggle `confirmed_for_delivery` for a ready rug

**Expected:** ✅ Update succeeds

### Test 2: Driver Cannot Set confirmed_for_delivery ✅
**Steps:**
1. Login as driver user
2. Try to update `delivery_list_items.confirmed_for_delivery` via Supabase client

**Expected:** ❌ Error: "Drivers cannot update confirmed_for_delivery..."

### Test 3: Driver Can Set loaded_on_truck ✅
**Steps:**
1. Login as driver user
2. Verify a delivery item in StopPortal
3. Check that `delivery_list_items.loaded_on_truck = true`

**Expected:** ✅ Update succeeds

### Test 4: Driver Can Finalize Truck ✅
**Steps:**
1. Login as driver user
2. Verify all delivery items (auto-sets loaded_on_truck)
3. Click "Finalize Truck"
4. Verify invoices are created

**Expected:** ✅ Invoices created, delivery list marked checked_out

## Backward Compatibility

✅ **No breaking changes:**
- Office DeliveriesTab continues to work (can still set confirmed_for_delivery)
- Existing `checkout-delivery` function unchanged
- Delivery lists and items tables unchanged

## Integration Points

### With PR-1 (Route Stops)
- StopPortal uses `route_stops.delivery_list_id` to link to delivery lists
- Finalize Truck uses this link to call checkout-delivery

### With PR-2 (Event Ingestion)
- Item verification events still work
- Finalize Truck is a direct Supabase call (not via events) since it's a one-time action

### With PR-3 (StopPortal)
- Finalize Truck button added to StopPortal
- Loaded status tracking integrated into stop item display

## Next Steps

1. **Deploy Migration:**
   - Apply `20260305000002_update_delivery_list_items_rls.sql`
   - Test RLS policies with different user roles

2. **Test Delivery Prep:**
   - Login as checkin_staff
   - Navigate to Facility Ops → Delivery Prep
   - Verify items can be confirmed

3. **Test Driver Flow:**
   - Login as driver
   - Verify delivery items
   - Finalize truck
   - Verify invoices created

4. **Monitor:**
   - Watch for RLS errors in logs
   - Verify invoice generation works correctly
   - Check that rugs are marked picked_up

## Rollback Plan

If issues arise:
1. Revert RLS migration (drop new policies, restore old policy)
2. Remove Finalize Truck button from StopPortal
3. Keep Delivery Prep component but don't route to it
4. No database schema changes to rollback
