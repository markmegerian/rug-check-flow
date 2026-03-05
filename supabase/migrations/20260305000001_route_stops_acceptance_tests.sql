-- Acceptance Tests for Route Stops Implementation
-- These tests verify the state machine and RLS enforcement
-- Run these after applying the main migration

-- ============================================================================
-- Test 1: Stop cannot become completed without signature
-- ============================================================================

DO $$
DECLARE
    v_test_client_id uuid;
    v_test_stop_id uuid;
    v_error_occurred boolean := false;
BEGIN
    -- Create a test client
    INSERT INTO "public"."clients" ("name", "route_day", "address")
    VALUES ('Test Client for Stop Completion', 'Monday', '123 Test St')
    RETURNING "id" INTO v_test_client_id;

    -- Create a test stop
    INSERT INTO "public"."route_stops" (
        "route_date",
        "client_id",
        "route_day",
        "status"
    ) VALUES (
        CURRENT_DATE,
        v_test_client_id,
        'Monday',
        'in_progress'::"public"."route_stop_status"
    ) RETURNING "id" INTO v_test_stop_id;

    -- Add a test item
    INSERT INTO "public"."route_stop_items" (
        "route_stop_id",
        "phase",
        "status",
        "rug_id"
    ) VALUES (
        v_test_stop_id,
        'delivery'::"public"."route_stop_phase",
        'verified'::"public"."route_stop_item_status",
        (SELECT "id" FROM "public"."rugs" LIMIT 1)
    );

    -- Try to complete without signature (should fail)
    BEGIN
        UPDATE "public"."route_stops"
        SET "status" = 'completed'::"public"."route_stop_status"
        WHERE "id" = v_test_stop_id;
        
        RAISE EXCEPTION 'Test failed: Stop completed without signature';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%signature is required%' THEN
                RAISE NOTICE 'PASS: Stop completion blocked without signature';
            ELSE
                RAISE EXCEPTION 'Unexpected error: %', SQLERRM;
            END IF;
    END;

    -- Cleanup
    DELETE FROM "public"."route_stop_items" WHERE "route_stop_id" = v_test_stop_id;
    DELETE FROM "public"."route_stops" WHERE "id" = v_test_stop_id;
    DELETE FROM "public"."clients" WHERE "id" = v_test_client_id;
END $$;

-- ============================================================================
-- Test 2: Stop cannot become completed with pending items
-- ============================================================================

DO $$
DECLARE
    v_test_client_id uuid;
    v_test_stop_id uuid;
BEGIN
    -- Create a test client
    INSERT INTO "public"."clients" ("name", "route_day", "address")
    VALUES ('Test Client for Pending Items', 'Monday', '123 Test St')
    RETURNING "id" INTO v_test_client_id;

    -- Create a test stop with signature
    INSERT INTO "public"."route_stops" (
        "route_date",
        "client_id",
        "route_day",
        "status",
        "signature_data_url"
    ) VALUES (
        CURRENT_DATE,
        v_test_client_id,
        'Monday',
        'in_progress'::"public"."route_stop_status",
        'data:image/png;base64,test'
    ) RETURNING "id" INTO v_test_stop_id;

    -- Add a pending item (not verified)
    INSERT INTO "public"."route_stop_items" (
        "route_stop_id",
        "phase",
        "status",
        "rug_id"
    ) VALUES (
        v_test_stop_id,
        'delivery'::"public"."route_stop_phase",
        'pending'::"public"."route_stop_item_status",
        (SELECT "id" FROM "public"."rugs" LIMIT 1)
    );

    -- Try to complete with pending item (should fail)
    BEGIN
        UPDATE "public"."route_stops"
        SET "status" = 'completed'::"public"."route_stop_status"
        WHERE "id" = v_test_stop_id;
        
        RAISE EXCEPTION 'Test failed: Stop completed with pending items';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%all items must be verified%' THEN
                RAISE NOTICE 'PASS: Stop completion blocked with pending items';
            ELSE
                RAISE EXCEPTION 'Unexpected error: %', SQLERRM;
            END IF;
    END;

    -- Cleanup
    DELETE FROM "public"."route_stop_items" WHERE "route_stop_id" = v_test_stop_id;
    DELETE FROM "public"."route_stops" WHERE "id" = v_test_stop_id;
    DELETE FROM "public"."clients" WHERE "id" = v_test_client_id;
END $$;

-- ============================================================================
-- Test 3: Valid stop completion succeeds
-- ============================================================================

DO $$
DECLARE
    v_test_client_id uuid;
    v_test_stop_id uuid;
BEGIN
    -- Create a test client
    INSERT INTO "public"."clients" ("name", "route_day", "address")
    VALUES ('Test Client for Valid Completion', 'Monday', '123 Test St')
    RETURNING "id" INTO v_test_client_id;

    -- Create a test stop with signature
    INSERT INTO "public"."route_stops" (
        "route_date",
        "client_id",
        "route_day",
        "status",
        "signature_data_url"
    ) VALUES (
        CURRENT_DATE,
        v_test_client_id,
        'Monday',
        'in_progress'::"public"."route_stop_status",
        'data:image/png;base64,test'
    ) RETURNING "id" INTO v_test_stop_id;

    -- Add verified items
    INSERT INTO "public"."route_stop_items" (
        "route_stop_id",
        "phase",
        "status",
        "rug_id"
    ) VALUES (
        v_test_stop_id,
        'delivery'::"public"."route_stop_phase",
        'verified'::"public"."route_stop_item_status",
        (SELECT "id" FROM "public"."rugs" LIMIT 1)
    );

    -- Complete the stop (should succeed)
    UPDATE "public"."route_stops"
    SET "status" = 'completed'::"public"."route_stop_status"
    WHERE "id" = v_test_stop_id;

    -- Verify completion
    IF (SELECT "status" FROM "public"."route_stops" WHERE "id" = v_test_stop_id) = 'completed' THEN
        RAISE NOTICE 'PASS: Valid stop completion succeeded';
    ELSE
        RAISE EXCEPTION 'Test failed: Stop status not set to completed';
    END IF;

    -- Cleanup
    DELETE FROM "public"."route_stop_items" WHERE "route_stop_id" = v_test_stop_id;
    DELETE FROM "public"."route_stops" WHERE "id" = v_test_stop_id;
    DELETE FROM "public"."clients" WHERE "id" = v_test_client_id;
END $$;

-- ============================================================================
-- Test 4: Invalid status transition is blocked
-- ============================================================================

DO $$
DECLARE
    v_test_client_id uuid;
    v_test_stop_id uuid;
BEGIN
    -- Create a test client
    INSERT INTO "public"."clients" ("name", "route_day", "address")
    VALUES ('Test Client for Invalid Transition', 'Monday', '123 Test St')
    RETURNING "id" INTO v_test_client_id;

    -- Create a completed stop
    INSERT INTO "public"."route_stops" (
        "route_date",
        "client_id",
        "route_day",
        "status",
        "signature_data_url"
    ) VALUES (
        CURRENT_DATE,
        v_test_client_id,
        'Monday',
        'completed'::"public"."route_stop_status",
        'data:image/png;base64,test'
    ) RETURNING "id" INTO v_test_stop_id;

    -- Try to transition from completed to in_progress (should fail)
    BEGIN
        UPDATE "public"."route_stops"
        SET "status" = 'in_progress'::"public"."route_stop_status"
        WHERE "id" = v_test_stop_id;
        
        RAISE EXCEPTION 'Test failed: Invalid transition allowed';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%Invalid status transition%' THEN
                RAISE NOTICE 'PASS: Invalid status transition blocked';
            ELSE
                RAISE EXCEPTION 'Unexpected error: %', SQLERRM;
            END IF;
    END;

    -- Cleanup
    DELETE FROM "public"."route_stops" WHERE "id" = v_test_stop_id;
    DELETE FROM "public"."clients" WHERE "id" = v_test_client_id;
END $$;

-- ============================================================================
-- Test 5: build_route_stops_for_date function works
-- ============================================================================

DO $$
DECLARE
    v_result record;
BEGIN
    -- Call the function (may not create stops if no data exists, but should not error)
    SELECT * INTO v_result FROM "public"."build_route_stops_for_date"(CURRENT_DATE);
    
    RAISE NOTICE 'PASS: build_route_stops_for_date executed successfully';
    RAISE NOTICE 'Result: stops_created=%, stops_updated=%, items_created=%', 
        v_result.stops_created, v_result.stops_updated, v_result.items_created;
END $$;

-- ============================================================================
-- Summary
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'All acceptance tests completed';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Manual RLS tests required:';
    RAISE NOTICE '1. Create a driver user and verify they can SELECT assigned stops';
    RAISE NOTICE '2. Verify driver cannot UPDATE route_stops directly';
    RAISE NOTICE '3. Verify driver can INSERT route_stop_events for assigned stops';
    RAISE NOTICE '4. Verify portal users have no access to route_stops';
    RAISE NOTICE '5. Verify office/admin can manage all stops';
END $$;
