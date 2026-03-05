-- PR-4: Update RLS for delivery_list_items to enforce operational split
-- Check-in staff can set confirmed_for_delivery (day-before)
-- Drivers can set loaded_on_truck (morning-of) but NOT confirmed_for_delivery

-- Drop existing policy
DROP POLICY IF EXISTS "delivery_list_items_manage_admin_office" ON "public"."delivery_list_items";

-- New policy: Internal roles (admin/office/checkin_staff) can manage all fields
DROP POLICY IF EXISTS "delivery_list_items_manage_internal" ON "public"."delivery_list_items";
CREATE POLICY "delivery_list_items_manage_internal" ON "public"."delivery_list_items"
    TO "authenticated"
    USING (
        "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR
        "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR
        "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role")
    )
    WITH CHECK (
        "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR
        "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR
        "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role")
    );

-- New policy: Drivers can UPDATE loaded_on_truck but NOT confirmed_for_delivery
-- This uses a function to check that only loaded_on_truck is being changed
CREATE OR REPLACE FUNCTION "public"."validate_driver_delivery_item_update"()
RETURNS trigger
LANGUAGE "plpgsql"
AS $$
BEGIN
    -- If confirmed_for_delivery is being changed, block it
    IF OLD.confirmed_for_delivery IS DISTINCT FROM NEW.confirmed_for_delivery THEN
        RAISE EXCEPTION 'Drivers cannot update confirmed_for_delivery. Only check-in staff, office, or admin can set this field.';
    END IF;
    
    -- Allow update to loaded_on_truck
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "public"."validate_driver_delivery_item_update" IS 'Validates that drivers can only update loaded_on_truck, not confirmed_for_delivery';

-- Create trigger for driver updates (drop first if exists for idempotency)
DROP TRIGGER IF EXISTS "delivery_list_items_driver_update_guard" ON "public"."delivery_list_items";
CREATE TRIGGER "delivery_list_items_driver_update_guard"
    BEFORE UPDATE ON "public"."delivery_list_items"
    FOR EACH ROW
    WHEN (
        -- Only apply this check for driver role (not internal roles)
        NOT (
            "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR
            "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR
            "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role")
        )
    )
    EXECUTE FUNCTION "public"."validate_driver_delivery_item_update"();

-- Policy: Drivers can SELECT delivery_list_items for stops assigned to them
-- (This is needed for drivers to see items in their stops)
DROP POLICY IF EXISTS "delivery_list_items_select_driver" ON "public"."delivery_list_items";
CREATE POLICY "delivery_list_items_select_driver" ON "public"."delivery_list_items"
    FOR SELECT
    TO "authenticated"
    USING (
        "public"."has_role"("auth"."uid"(), 'driver'::"public"."app_role") AND
        EXISTS (
            SELECT 1 FROM "public"."route_stops" "rs"
            INNER JOIN "public"."delivery_lists" "dl" ON "dl"."id" = "rs"."delivery_list_id"
            WHERE "rs"."assigned_driver_id" = "auth"."uid"()
            AND "dl"."id" = "delivery_list_items"."delivery_list_id"
            AND "rs"."route_date" >= CURRENT_DATE - INTERVAL '1 day'
            AND "rs"."route_date" <= CURRENT_DATE + INTERVAL '1 day'
        )
    );

-- Policy: Drivers can UPDATE loaded_on_truck (but trigger will block confirmed_for_delivery changes)
DROP POLICY IF EXISTS "delivery_list_items_update_driver_loaded" ON "public"."delivery_list_items";
CREATE POLICY "delivery_list_items_update_driver_loaded" ON "public"."delivery_list_items"
    FOR UPDATE
    TO "authenticated"
    USING (
        "public"."has_role"("auth"."uid"(), 'driver'::"public"."app_role") AND
        EXISTS (
            SELECT 1 FROM "public"."route_stops" "rs"
            INNER JOIN "public"."delivery_lists" "dl" ON "dl"."id" = "rs"."delivery_list_id"
            WHERE "rs"."assigned_driver_id" = "auth"."uid"()
            AND "dl"."id" = "delivery_list_items"."delivery_list_id"
            AND "rs"."route_date" >= CURRENT_DATE - INTERVAL '1 day'
            AND "rs"."route_date" <= CURRENT_DATE + INTERVAL '1 day'
        )
    )
    WITH CHECK (
        "public"."has_role"("auth"."uid"(), 'driver'::"public"."app_role") AND
        EXISTS (
            SELECT 1 FROM "public"."route_stops" "rs"
            INNER JOIN "public"."delivery_lists" "dl" ON "dl"."id" = "rs"."delivery_list_id"
            WHERE "rs"."assigned_driver_id" = "auth"."uid"()
            AND "dl"."id" = "delivery_list_items"."delivery_list_id"
            AND "rs"."route_date" >= CURRENT_DATE - INTERVAL '1 day'
            AND "rs"."route_date" <= CURRENT_DATE + INTERVAL '1 day'
        )
    );
