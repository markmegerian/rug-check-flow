# Deliveries Performance Slice 01 - 2026-04-22

## Goal
Reduce initial `/office/deliveries` boot-time browser work by removing the separate client-list query from the weekly route overview path and replacing it with a backend-shaped route overview RPC.

## Cause
`src/components/office/DeliveriesTab.tsx` was assembling the weekly route overview in the browser from multiple reads:
- `clients`
- `delivery_lists`
- later detail/history-specific fetches

Even before detail mode, the page paid a startup cost to load and shape route clients entirely in the UI layer.

## Fix
Added additive RPC:
- `public.get_delivery_route_overview()`
- migration: `supabase/migrations/20260422135500_add_delivery_route_overview_function.sql`

Added app loader:
- `src/lib/delivery-route-overview.ts`

Cut weekly-route client boot path to backend snapshot input:
- `src/components/office/DeliveriesTab.tsx`
  - now uses React Query + `fetchDeliveryRouteOverview()`
  - derives unique route clients from the RPC result
  - keeps delivery list detail, compile, checkout, and history behavior unchanged for this slice

Updated RPC typings:
- `src/integrations/supabase/extended.ts`

## Verification
Local:
- `npm run build` ✅
- `npm test` ✅
  - 44 passed, 1 skipped files
  - 288 passed, 3 skipped tests

Live DB:
- `supabase db push --linked` ✅
- applied migration:
  - `20260422135500_add_delivery_route_overview_function.sql`

## Scope boundary
This is intentionally narrow.

Not changed yet:
- compile/recompile flow
- detail hydration (`delivery_list_items` + `rugs`)
- history invoice hydration
- checkout behavior

## Next likely slice
If `/office/deliveries` still feels heavy after this, the next professional cut is detail-mode hydration:
- backend-owned delivery list detail snapshot
- keep mutation endpoints/actions additive and unchanged until verified
