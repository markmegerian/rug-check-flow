# Services / Pricing Consolidation Slice 01 Verification - 2026-04-21

## What was implemented

This slice implemented the first additive backend change identified in the prior audit:

### Added migration
- `supabase/migrations/20260421012500_add_rug_service_snapshot_fields.sql`

This migration adds to `rug_services`:
- `service_category`
- `service_unit`
- `requires_estimate`
- backfill from `services`
- index on `service_category`

### Code updated

#### App-side / bindings
- `src/integrations/supabase/types.ts`
- `src/lib/rug-service-approval.ts`
- `src/components/office/InvoiceCreateSheet.tsx`

#### Backend workflow functions
- `supabase/functions/check-in-workflow/index.ts`
- `supabase/functions/estimate-workflow/index.ts`
- `supabase/functions/generate-invoice-workflow/index.ts`
- `supabase/functions/invoice-pdf/index.ts`

## What changed semantically

### Before
Downstream estimate/invoice/PDF logic frequently re-queried `services` to recover category semantics from `service_id`.

### After
The first cutover now writes snapshot semantics into `rug_services` at Check In time and reads `service_category` from `rug_services` in several downstream paths.

This reduces dependence on the live catalog for historical service semantics.

## Verification performed

### 1. Code wiring verification
Confirmed the following now use or populate snapshot semantics:

- Check In workflow writes `service_category`, `service_unit`, `requires_estimate`
- estimate workflow reads `service_category` from `rug_services`, with fallback backfill only for older rows
- invoice generation reads `service_category` from `rug_services`
- invoice PDF reads `service_category` from `rug_services`
- office invoice creation preview reads `service_category` from `rug_services`
- app-side rug service helper carries snapshot fields in selects/inserts

### 2. Build verification
Ran:
- `npm run build`

Result:
- passed successfully

### 3. Test verification
Ran:
- `npm test`

Result:
- `Test Files  44 passed | 1 skipped (45)`
- `Tests  278 passed | 3 skipped (281)`

### 4. Live migration application status
Ran:
- `supabase migration list`

Result:
- migration `20260421012500` exists locally
- migration `20260421012500` is **not yet applied remotely**

That means:
- code and migration are prepared
- local build/tests are green
- live DB application is still pending

## What is connected correctly right now

### Correctly connected in code
- check-in write path
- estimate read path
- invoice generation read path
- invoice PDF read path
- office invoice preview path
- typed schema alignment in app code

### Not yet complete end-to-end
- live database representation is not yet updated, because the migration has not yet been applied remotely

## Professional status of this slice

### Completed
- additive migration authored
- code cutover implemented
- local build verified
- local tests verified
- integration wiring reviewed

### Pending to fully close the slice
- apply migration `20260421012500` to live DB
- verify live migration presence
- optionally spot-check affected paths against live DB after application

## Final judgment

This slice is **implemented and locally verified**, but **not fully closed** until the migration is applied remotely and re-verified live.
