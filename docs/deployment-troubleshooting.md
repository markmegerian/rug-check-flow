# Deployment Troubleshooting: PR-1 through PR-4

## Common Issues and Solutions

### Issue: "Type already exists" errors when running migrations

**Cause:** The migration was partially applied or run multiple times.

**Solution:** The migrations have been updated to be idempotent. Re-run them - they will now skip existing objects.

**Updated Migration Files:**
- `20260305000000_add_route_stops_unified_model.sql` - Now uses DO blocks for enums, DROP TRIGGER IF EXISTS
- `20260305000002_update_delivery_list_items_rls.sql` - Now uses DROP POLICY IF EXISTS, DROP TRIGGER IF EXISTS

### Issue: "Table already exists" errors

**Solution:** Tables use `CREATE TABLE IF NOT EXISTS` - these should be safe to rerun. If you still get errors, the table structure may have changed. Check the table structure in Supabase Dashboard → Table Editor.

### Issue: "Function already exists" errors

**Solution:** Functions use `CREATE OR REPLACE FUNCTION` - these should be safe to rerun. If you get errors, check if the function signature changed.

### Issue: "Trigger already exists" errors

**Solution:** Updated migrations now use `DROP TRIGGER IF EXISTS` before creating triggers. Re-run the migration.

### Issue: "Policy already exists" errors

**Solution:** Updated migrations now use `DROP POLICY IF EXISTS` before creating policies. Re-run the migration.

## Safe Re-run Procedure

If you encounter "already exists" errors:

1. **Check what exists:**
   ```sql
   -- Check types
   SELECT typname FROM pg_type WHERE typnamespace = 'public'::regnamespace 
   AND typname IN ('route_stop_status', 'route_stop_phase', 'route_stop_item_status', 'dispute_type', 'dispute_status');
   
   -- Check tables
   SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
   AND tablename IN ('route_stops', 'route_stop_items', 'route_stop_events', 'disputes');
   
   -- Check functions
   SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace 
   AND proname LIKE '%route_stop%' OR proname LIKE '%dispute%';
   ```

2. **Re-run the updated migrations:**
   - The updated migrations are now idempotent
   - They will skip existing objects or replace them safely

3. **If still having issues, manual cleanup:**
   ```sql
   -- Only if absolutely necessary - be careful!
   DROP TRIGGER IF EXISTS route_stops_status_transition_trigger ON route_stops;
   DROP TRIGGER IF EXISTS route_stop_items_status_transition_trigger ON route_stop_items;
   DROP TRIGGER IF EXISTS delivery_list_items_driver_update_guard ON delivery_list_items;
   
   DROP FUNCTION IF EXISTS validate_route_stop_status_transition;
   DROP FUNCTION IF EXISTS validate_route_stop_completion;
   DROP FUNCTION IF EXISTS route_stops_status_transition_guard;
   DROP FUNCTION IF EXISTS validate_route_stop_item_status_transition;
   DROP FUNCTION IF EXISTS route_stop_items_status_transition_guard;
   DROP FUNCTION IF EXISTS build_route_stops_for_date;
   DROP FUNCTION IF EXISTS validate_driver_delivery_item_update;
   
   -- Then re-run migrations
   ```

## Verification After Re-run

After re-running migrations, verify:

```sql
-- Check all types exist
SELECT typname FROM pg_type WHERE typnamespace = 'public'::regnamespace 
AND typname IN ('route_stop_status', 'route_stop_phase', 'route_stop_item_status', 'dispute_type', 'dispute_status');
-- Should return 5 rows

-- Check all tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' 
AND tablename IN ('route_stops', 'route_stop_items', 'route_stop_events', 'disputes');
-- Should return 4 rows

-- Check triggers exist
SELECT tgname FROM pg_trigger WHERE tgname IN (
  'route_stops_status_transition_trigger',
  'route_stop_items_status_transition_trigger',
  'delivery_list_items_driver_update_guard'
);
-- Should return 3 rows

-- Check function exists
SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace 
AND proname = 'build_route_stops_for_date';
-- Should return 1 row
```

## Next Steps

Once migrations run successfully:
1. Deploy edge function `ingest-stop-events`
2. Test the workflows
3. Verify RLS policies work correctly
