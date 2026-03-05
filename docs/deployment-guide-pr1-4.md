# Deployment Guide: PR-1 through PR-4

This guide covers deploying all changes from PR-1 through PR-4 to enable full testing.

## Pre-Deployment Checklist

- [x] All code committed and merged to main
- [ ] Supabase project access confirmed
- [ ] Environment variables configured
- [ ] Backup of current database (recommended)

## Deployment Steps

### Step 1: Deploy Database Migrations

The migrations must be applied in order:

1. **PR-1 Migration** (`20260305000000_add_route_stops_unified_model.sql`)
   - Creates route_stops schema, enums, tables, triggers, functions
   - **Critical:** This is the foundation for all other PRs

2. **PR-4 RLS Migration** (`20260305000002_update_delivery_list_items_rls.sql`)
   - Updates RLS policies for delivery_list_items
   - Adds trigger to block drivers from updating confirmed_for_delivery

**Option A: Via Supabase Dashboard**
1. Go to https://supabase.com/dashboard/project/toitgmaeuscrdwbpntda
2. Navigate to SQL Editor
3. Copy and paste the migration SQL files in order
4. Execute each migration
5. Verify no errors

**Option B: Via Supabase CLI** (if available)
```bash
# Link to project (if not already linked)
supabase link --project-ref toitgmaeuscrdwbpntda

# Apply migrations
supabase db push
```

**Option C: Manual SQL Execution**
1. Connect to your Supabase database
2. Execute migrations in order via psql or database client

### Step 2: Deploy Edge Function

**Function:** `ingest-stop-events`

**Option A: Via Supabase Dashboard**
1. Go to Edge Functions in Supabase Dashboard
2. Click "Create a new function"
3. Name: `ingest-stop-events`
4. Copy contents from `supabase/functions/ingest-stop-events/index.ts`
5. Deploy

**Option B: Via Supabase CLI**
```bash
supabase functions deploy ingest-stop-events
```

**Required Environment Variables:**
- `SUPABASE_URL` (auto-set)
- `SUPABASE_SERVICE_ROLE_KEY` (set in dashboard)
- `SUPABASE_ANON_KEY` (auto-set)

### Step 3: Update Frontend Configuration

**Install Dependencies:**
```bash
npm install
```

This will install `dexie` which was added for the offline queue.

**Update App Root** (if not already done):
Wrap your app with `OfflineQueueProvider` in the root component:

```tsx
// src/App.tsx or src/main.tsx
import { OfflineQueueProvider } from "@/contexts/OfflineQueueContext";

// Wrap your app
<OfflineQueueProvider>
  <App />
</OfflineQueueProvider>
```

**Update Routing** (if not already done):
Update driver route to use `StopPortal` instead of `DriverPortal`:

```tsx
// src/App.tsx
import StopPortal from "@/pages/StopPortal";

<Route
  path="/driver"
  element={
    <ProtectedRoute allowedRoles={["admin", "driver"]}>
      <StopPortal />
    </ProtectedRoute>
  }
/>
```

### Step 4: Build and Deploy Frontend

**Build:**
```bash
npm run build
```

**Deploy:**
- Deploy the `dist/` folder to your hosting platform
- Or run `npm run dev` for local testing

### Step 5: Run Acceptance Tests

**Database Tests:**
```bash
# Run acceptance test SQL
psql <connection-string> < supabase/migrations/20260305000001_route_stops_acceptance_tests.sql
```

Or execute via Supabase Dashboard SQL Editor.

**Edge Function Tests:**
See `supabase/functions/ingest-stop-events/acceptance-tests.md` for manual test procedures.

**Frontend Tests:**
```bash
npm run test
npm run lint
```

### Step 6: Smoke Tests

**Run staging smoke test:**
```bash
./scripts/staging-smoke-test.sh
```

**Run RLS scope smoke test:**
```bash
./scripts/rls-scope-smoke-test.sh
```

## Verification Checklist

After deployment, verify:

### Database
- [ ] `route_stops` table exists
- [ ] `route_stop_items` table exists
- [ ] `route_stop_events` table exists
- [ ] `disputes` table exists
- [ ] All enums created (route_stop_status, route_stop_phase, etc.)
- [ ] Triggers are active
- [ ] `build_route_stops_for_date()` function exists
- [ ] RLS policies are active

### Edge Function
- [ ] `ingest-stop-events` function is deployed
- [ ] Function responds to test requests
- [ ] Function handles authentication correctly

### Frontend
- [ ] App builds without errors
- [ ] `OfflineQueueProvider` is wrapping the app
- [ ] Driver route uses `StopPortal`
- [ ] Facility Ops shows "Delivery Prep" tab
- [ ] No console errors on page load

### Functional Tests
- [ ] Check-in staff can access Delivery Prep tab
- [ ] Check-in staff can toggle confirmed_for_delivery
- [ ] Driver can see assigned stops
- [ ] Driver can start a stop
- [ ] Driver can verify items
- [ ] Driver can add signature
- [ ] Driver can complete stop
- [ ] Offline queue works (test in airplane mode)
- [ ] Events sync when online
- [ ] Finalize Truck button appears for delivery stops
- [ ] Finalize Truck generates invoices

## Rollback Plan

If issues arise:

1. **Rollback Migrations:**
   - Drop new tables: `route_stops`, `route_stop_items`, `route_stop_events`, `disputes`
   - Drop new enums
   - Drop triggers and functions
   - Restore old RLS policies

2. **Rollback Edge Function:**
   - Delete `ingest-stop-events` function from dashboard

3. **Rollback Frontend:**
   - Revert to previous commit
   - Or keep code but don't route to new components

## Post-Deployment

1. Monitor error logs in Supabase Dashboard
2. Test with real users (check-in staff, drivers)
3. Verify invoice generation works
4. Check that route stops are being generated correctly
5. Monitor sync queue for offline events

## Next Steps After Deployment

Once deployed and tested:
- Proceed to PR-5 through PR-16 (accounting, disputes, messaging, etc.)
- Or fix any issues found during testing
