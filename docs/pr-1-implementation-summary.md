# PR-1 Implementation Summary: Unified Route Stop Execution Model

## Overview

This PR implements the unified "route stop" execution model in the database with explicit state machines and RLS enforcement. The stop layer composes delivery and pickup operations into a single driver experience, while maintaining backward compatibility with existing Office DeliveriesTab and Portal pickup_requests flows.

## Files Changed

### New Files
- `supabase/migrations/20260305000000_add_route_stops_unified_model.sql` - Main migration
- `supabase/migrations/20260305000001_route_stops_acceptance_tests.sql` - Acceptance test suite
- `docs/route-stops-state-machine.md` - State machine documentation
- `docs/pr-1-implementation-summary.md` - This file

## Implementation Details

### A) New Enums Created

1. **`route_stop_status`**: `queued`, `in_progress`, `completed`, `completed_with_exceptions`, `unable_to_complete`
2. **`route_stop_phase`**: `delivery`, `pickup`
3. **`route_stop_item_status`**: `pending`, `verified`, `disputed`, `exception`, `skipped`
4. **`dispute_type`**: `refused_delivery`, `post_delivery_claim`
5. **`dispute_status`**: `open`, `investigating`, `resolved`, `credited`, `denied`

### B) New Tables Created

1. **`route_stops`**
   - One stop per client per route_date
   - Links to `delivery_list_id` and/or `pickup_request_id` (nullable)
   - Single `signature_data_url` for entire stop
   - Status tracking with timestamps (`started_at`, `completed_at`)
   - Unique constraint on `(client_id, route_date)`

2. **`route_stop_items`**
   - One item per rug per phase (delivery or pickup)
   - Links to `delivery_list_item_id` or `pickup_request_item_id`
   - Status tracking per item
   - Photo URLs array for evidence
   - Constraint: delivery items must have `rug_id` (pickup items may not)

3. **`route_stop_events`**
   - Idempotent event ingestion for offline-first operation
   - Unique constraint on `offline_event_id` for deduplication
   - JSONB payload for event-specific data

4. **`disputes`**
   - Tracks refused deliveries and post-delivery claims
   - Links to `rug_id` and `client_id`

### C) RLS Policies

**Drivers:**
- Can SELECT assigned stops for today ± 1 day
- Can INSERT `route_stop_events` for assigned stops
- Cannot directly UPDATE `route_stops` or `route_stop_items`

**Internal Roles (admin/office/checkin_staff):**
- Full CRUD access to all stops, items, events, and disputes

**Portal Users:**
- No access to route stops
- Can SELECT disputes for their own client

### D) State Machine Enforcement

**Functions:**
- `validate_route_stop_status_transition()` - Validates allowed status transitions
- `validate_route_stop_completion()` - Validates completion invariants (signature, item states)
- `validate_route_stop_item_status_transition()` - Validates item status transitions

**Triggers:**
- `route_stops_status_transition_trigger` - Enforces stop status transitions and completion rules
- `route_stop_items_status_transition_trigger` - Enforces item status transitions

**Completion Rules:**
- `completed`: Requires signature AND all items in `verified` or `skipped`
- `completed_with_exceptions`: Requires signature AND all items resolved AND at least one `disputed` or `exception`
- `unable_to_complete`: Requires `exception_code` set

**Audit Logging:**
- Status changes automatically logged to `communication_events` table

### E) Stop Build Function

**`build_route_stops_for_date(target_date)`**
- Processes delivery items from `delivery_list_items` where `confirmed_for_delivery = true`
- Processes pickup items from `pickup_requests` where `status = 'assigned'`
- Groups by `client_id`, creates one stop per client per date
- Idempotent: can be run multiple times safely
- Returns counts: `stops_created`, `stops_updated`, `items_created`

## Backward Compatibility

✅ **No breaking changes:**
- `delivery_lists` and `delivery_list_items` tables unchanged
- `pickup_requests` and `pickup_request_items` tables unchanged
- Existing Office DeliveriesTab continues to work
- Existing Portal pickup_requests flow continues to work
- Stops are generated from existing sources (additive only)

## Acceptance Tests

The acceptance test suite (`20260305000001_route_stops_acceptance_tests.sql`) verifies:

1. ✅ Stop cannot become completed without signature
2. ✅ Stop cannot become completed with pending items
3. ✅ Valid stop completion succeeds
4. ✅ Invalid status transition is blocked
5. ✅ `build_route_stops_for_date` function executes successfully

**Manual RLS Tests Required:**
- Driver can SELECT assigned stops
- Driver cannot UPDATE route_stops directly
- Driver can INSERT route_stop_events for assigned stops
- Portal users have no access to route_stops
- Office/admin can manage all stops

## Next Steps

After this PR is merged:

1. **PR-2**: Add state machine triggers for delivery_lists and invoices
2. **PR-3**: (Already included in this PR - stop generation function)
3. **PR-4**: Create `ingest-stop-events` edge function
4. **PR-5**: Frontend offline queue infrastructure
5. **PR-6**: Refactor DriverPortal → StopPortal

## Type Generation

**Note:** The TypeScript types in `src/integrations/supabase/types.ts` will need to be regenerated after applying this migration. You can:

1. Use Supabase CLI: `supabase gen types typescript --local > src/integrations/supabase/types.ts`
2. Or manually add the new table types following the existing pattern

## Migration Order

1. Apply `20260305000000_add_route_stops_unified_model.sql`
2. Run acceptance tests: `20260305000001_route_stops_acceptance_tests.sql`
3. Verify RLS policies with manual tests
4. Regenerate TypeScript types
5. Merge PR

## Rollback Plan

If issues arise, the migration can be rolled back by:

```sql
-- Drop triggers
DROP TRIGGER IF EXISTS route_stops_status_transition_trigger ON route_stops;
DROP TRIGGER IF EXISTS route_stop_items_status_transition_trigger ON route_stop_items;

-- Drop functions
DROP FUNCTION IF EXISTS validate_route_stop_status_transition;
DROP FUNCTION IF EXISTS validate_route_stop_completion;
DROP FUNCTION IF EXISTS validate_route_stop_item_status_transition;
DROP FUNCTION IF EXISTS route_stops_status_transition_guard;
DROP FUNCTION IF EXISTS route_stop_items_status_transition_guard;
DROP FUNCTION IF EXISTS build_route_stops_for_date;

-- Drop tables (cascade will handle foreign keys)
DROP TABLE IF EXISTS route_stop_events CASCADE;
DROP TABLE IF EXISTS route_stop_items CASCADE;
DROP TABLE IF EXISTS route_stops CASCADE;
DROP TABLE IF EXISTS disputes CASCADE;

-- Drop types
DROP TYPE IF EXISTS route_stop_status CASCADE;
DROP TYPE IF EXISTS route_stop_phase CASCADE;
DROP TYPE IF EXISTS route_stop_item_status CASCADE;
DROP TYPE IF EXISTS dispute_type CASCADE;
DROP TYPE IF EXISTS dispute_status CASCADE;
```

**Note:** This rollback will not affect existing `delivery_lists` or `pickup_requests` tables.
