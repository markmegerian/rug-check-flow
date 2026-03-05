-- PR-1: Unified Route Stop Execution Model
-- This migration adds the unified "Stop" layer that composes delivery + pickup
-- into one driver experience, with explicit state machines and RLS enforcement.
--
-- Constraints:
-- - Does NOT break existing Office DeliveriesTab (delivery_lists/delivery_list_items)
-- - Does NOT break existing Portal pickup_requests flow
-- - Stops are generated from these existing sources

-- ============================================================================
-- PART A: Create New Enums (Idempotent)
-- ============================================================================

-- Create enums only if they don't exist
DO $$ BEGIN
    CREATE TYPE "public"."route_stop_status" AS ENUM (
        'queued',
        'in_progress',
        'completed',
        'completed_with_exceptions',
        'unable_to_complete'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE "public"."route_stop_status" IS 'Status of a route stop (one per client per route date)';

DO $$ BEGIN
    CREATE TYPE "public"."route_stop_phase" AS ENUM (
        'delivery',
        'pickup'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE "public"."route_stop_phase" IS 'Phase of a stop item: delivery or pickup';

DO $$ BEGIN
    CREATE TYPE "public"."route_stop_item_status" AS ENUM (
        'pending',
        'verified',
        'disputed',
        'exception',
        'skipped'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE "public"."route_stop_item_status" IS 'Status of an individual item within a stop';

DO $$ BEGIN
    CREATE TYPE "public"."dispute_type" AS ENUM (
        'refused_delivery',
        'post_delivery_claim'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE "public"."dispute_type" IS 'Type of dispute: refused at delivery vs claim after delivery';

DO $$ BEGIN
    CREATE TYPE "public"."dispute_status" AS ENUM (
        'open',
        'investigating',
        'resolved',
        'credited',
        'denied'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE "public"."dispute_status" IS 'Status of a dispute record';

-- ============================================================================
-- PART B: Create New Tables
-- ============================================================================

-- route_stops: One stop per client per route_date
-- Combines delivery and pickup into a single driver execution unit
CREATE TABLE IF NOT EXISTS "public"."route_stops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_date" "date" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "route_day" "text" DEFAULT ''::"text" NOT NULL,
    "assigned_driver_id" "uuid",
    "delivery_list_id" "uuid",
    "pickup_request_id" "uuid",
    "status" "public"."route_stop_status" DEFAULT 'queued'::"public"."route_stop_status" NOT NULL,
    "signature_data_url" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "exception_code" "text",
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "route_stops_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE,
    CONSTRAINT "route_stops_delivery_list_id_fkey" FOREIGN KEY ("delivery_list_id") REFERENCES "public"."delivery_lists"("id") ON DELETE SET NULL,
    CONSTRAINT "route_stops_pickup_request_id_fkey" FOREIGN KEY ("pickup_request_id") REFERENCES "public"."pickup_requests"("id") ON DELETE SET NULL,
    CONSTRAINT "route_stops_assigned_driver_id_fkey" FOREIGN KEY ("assigned_driver_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL,
    CONSTRAINT "route_stops_unique_client_date" UNIQUE ("client_id", "route_date")
);

COMMENT ON TABLE "public"."route_stops" IS 'Unified stop model: one per client per route date, combines delivery + pickup';
COMMENT ON COLUMN "public"."route_stops"."route_date" IS 'The date this stop is scheduled for';
COMMENT ON COLUMN "public"."route_stops"."delivery_list_id" IS 'Optional link to delivery_list if this stop includes deliveries';
COMMENT ON COLUMN "public"."route_stops"."pickup_request_id" IS 'Optional link to pickup_request if this stop includes pickups';
COMMENT ON COLUMN "public"."route_stops"."signature_data_url" IS 'Single signature for the entire stop (delivery + pickup combined)';
COMMENT ON COLUMN "public"."route_stops"."exception_code" IS 'Code/reason when stop is unable_to_complete';

-- route_stop_items: Individual items within a stop (one per rug per phase)
CREATE TABLE IF NOT EXISTS "public"."route_stop_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_stop_id" "uuid" NOT NULL,
    "phase" "public"."route_stop_phase" NOT NULL,
    "status" "public"."route_stop_item_status" DEFAULT 'pending'::"public"."route_stop_item_status" NOT NULL,
    "rug_id" "uuid",
    "pickup_request_item_id" "uuid",
    "delivery_list_item_id" "uuid",
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "photo_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "exception_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "route_stop_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "route_stop_items_route_stop_id_fkey" FOREIGN KEY ("route_stop_id") REFERENCES "public"."route_stops"("id") ON DELETE CASCADE,
    CONSTRAINT "route_stop_items_rug_id_fkey" FOREIGN KEY ("rug_id") REFERENCES "public"."rugs"("id") ON DELETE SET NULL,
    CONSTRAINT "route_stop_items_pickup_request_item_id_fkey" FOREIGN KEY ("pickup_request_item_id") REFERENCES "public"."pickup_request_items"("id") ON DELETE SET NULL,
    CONSTRAINT "route_stop_items_delivery_list_item_id_fkey" FOREIGN KEY ("delivery_list_item_id") REFERENCES "public"."delivery_list_items"("id") ON DELETE SET NULL,
    CONSTRAINT "route_stop_items_delivery_rug_required" CHECK (
        ("phase" = 'delivery'::"public"."route_stop_phase" AND "rug_id" IS NOT NULL) OR
        ("phase" = 'pickup'::"public"."route_stop_phase")
    )
);

COMMENT ON TABLE "public"."route_stop_items" IS 'Individual items within a stop: one per rug per phase (delivery or pickup)';
COMMENT ON COLUMN "public"."route_stop_items"."phase" IS 'Whether this item is a delivery or pickup';
COMMENT ON COLUMN "public"."route_stop_items"."rug_id" IS 'Required for delivery items, optional for pickup items (may not be checked in yet)';
COMMENT ON COLUMN "public"."route_stop_items"."photo_urls" IS 'Evidence photos for this item (delivery photos or pickup photos)';
COMMENT ON COLUMN "public"."route_stop_items"."exception_code" IS 'Code/reason when item status is exception';

-- route_stop_events: Idempotent event ingestion for offline-first driver operation
CREATE TABLE IF NOT EXISTS "public"."route_stop_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "offline_event_id" "uuid" NOT NULL,
    "route_stop_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "route_stop_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "route_stop_events_offline_event_id_key" UNIQUE ("offline_event_id"),
    CONSTRAINT "route_stop_events_route_stop_id_fkey" FOREIGN KEY ("route_stop_id") REFERENCES "public"."route_stops"("id") ON DELETE CASCADE,
    CONSTRAINT "route_stop_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE
);

COMMENT ON TABLE "public"."route_stop_events" IS 'Idempotent event ingestion for offline-first driver operation. offline_event_id ensures no duplicates.';
COMMENT ON COLUMN "public"."route_stop_events"."offline_event_id" IS 'Client-generated UUID for idempotency (unique constraint)';
COMMENT ON COLUMN "public"."route_stop_events"."event_type" IS 'Event type: STOP_STARTED, SIGNATURE_SET, ITEM_VERIFIED, ITEM_EXCEPTION, ITEM_DISPUTED, STOP_COMPLETED, etc.';
COMMENT ON COLUMN "public"."route_stop_events"."payload" IS 'Event-specific JSON payload';

-- disputes: Dispute records for refused deliveries and post-delivery claims
CREATE TABLE IF NOT EXISTS "public"."disputes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rug_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "type" "public"."dispute_type" NOT NULL,
    "status" "public"."dispute_status" DEFAULT 'open'::"public"."dispute_status" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "disputes_rug_id_fkey" FOREIGN KEY ("rug_id") REFERENCES "public"."rugs"("id") ON DELETE CASCADE,
    CONSTRAINT "disputes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE,
    CONSTRAINT "disputes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL
);

COMMENT ON TABLE "public"."disputes" IS 'Dispute records: refused_delivery (rug stays ready) or post_delivery_claim (rug remains picked_up)';
COMMENT ON COLUMN "public"."disputes"."type" IS 'Type of dispute: refused at delivery vs claim after delivery';

-- ============================================================================
-- PART C: Create Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS "route_stops_route_date_idx" ON "public"."route_stops" ("route_date");
CREATE INDEX IF NOT EXISTS "route_stops_assigned_driver_date_idx" ON "public"."route_stops" ("assigned_driver_id", "route_date");
CREATE INDEX IF NOT EXISTS "route_stops_client_date_idx" ON "public"."route_stops" ("client_id", "route_date");
CREATE INDEX IF NOT EXISTS "route_stops_status_idx" ON "public"."route_stops" ("status");

CREATE INDEX IF NOT EXISTS "route_stop_items_route_stop_id_idx" ON "public"."route_stop_items" ("route_stop_id");
CREATE INDEX IF NOT EXISTS "route_stop_items_phase_status_idx" ON "public"."route_stop_items" ("phase", "status");
CREATE INDEX IF NOT EXISTS "route_stop_items_rug_id_idx" ON "public"."route_stop_items" ("rug_id") WHERE "rug_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "route_stop_events_route_stop_id_idx" ON "public"."route_stop_events" ("route_stop_id");
CREATE INDEX IF NOT EXISTS "route_stop_events_created_at_idx" ON "public"."route_stop_events" ("created_at");

CREATE INDEX IF NOT EXISTS "disputes_client_id_idx" ON "public"."disputes" ("client_id");
CREATE INDEX IF NOT EXISTS "disputes_rug_id_idx" ON "public"."disputes" ("rug_id");
CREATE INDEX IF NOT EXISTS "disputes_status_idx" ON "public"."disputes" ("status");

-- ============================================================================
-- PART D: Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE "public"."route_stops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."route_stop_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."route_stop_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."disputes" ENABLE ROW LEVEL SECURITY;

-- route_stops RLS
-- Drivers can SELECT assigned stops for today +/- 1 day
DROP POLICY IF EXISTS "route_stops_select_driver" ON "public"."route_stops";
CREATE POLICY "route_stops_select_driver" ON "public"."route_stops"
    FOR SELECT
    TO "authenticated"
    USING (
        "assigned_driver_id" = "auth"."uid"() AND
        "route_date" >= CURRENT_DATE - INTERVAL '1 day' AND
        "route_date" <= CURRENT_DATE + INTERVAL '1 day'
    );

-- Internal roles (admin/office/checkin_staff) can manage all stops
DROP POLICY IF EXISTS "route_stops_manage_internal" ON "public"."route_stops";
CREATE POLICY "route_stops_manage_internal" ON "public"."route_stops"
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

-- route_stop_items RLS
-- Drivers can SELECT items for stops assigned to them
DROP POLICY IF EXISTS "route_stop_items_select_driver" ON "public"."route_stop_items";
CREATE POLICY "route_stop_items_select_driver" ON "public"."route_stop_items"
    FOR SELECT
    TO "authenticated"
    USING (
        EXISTS (
            SELECT 1 FROM "public"."route_stops" "rs"
            WHERE "rs"."id" = "route_stop_items"."route_stop_id"
            AND "rs"."assigned_driver_id" = "auth"."uid"()
            AND "rs"."route_date" >= CURRENT_DATE - INTERVAL '1 day'
            AND "rs"."route_date" <= CURRENT_DATE + INTERVAL '1 day'
        )
    );

-- Internal roles can manage all items
DROP POLICY IF EXISTS "route_stop_items_manage_internal" ON "public"."route_stop_items";
CREATE POLICY "route_stop_items_manage_internal" ON "public"."route_stop_items"
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

-- route_stop_events RLS
-- Drivers can INSERT events for stops assigned to them
DROP POLICY IF EXISTS "route_stop_events_insert_driver" ON "public"."route_stop_events";
CREATE POLICY "route_stop_events_insert_driver" ON "public"."route_stop_events"
    FOR INSERT
    TO "authenticated"
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."route_stops" "rs"
            WHERE "rs"."id" = "route_stop_events"."route_stop_id"
            AND "rs"."assigned_driver_id" = "auth"."uid"()
        )
    );

-- Drivers can SELECT their own events
DROP POLICY IF EXISTS "route_stop_events_select_driver" ON "public"."route_stop_events";
CREATE POLICY "route_stop_events_select_driver" ON "public"."route_stop_events"
    FOR SELECT
    TO "authenticated"
    USING (
        EXISTS (
            SELECT 1 FROM "public"."route_stops" "rs"
            WHERE "rs"."id" = "route_stop_events"."route_stop_id"
            AND "rs"."assigned_driver_id" = "auth"."uid"()
        )
    );

-- Internal roles can manage all events
DROP POLICY IF EXISTS "route_stop_events_manage_internal" ON "public"."route_stop_events";
CREATE POLICY "route_stop_events_manage_internal" ON "public"."route_stop_events"
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

-- disputes RLS
-- Internal roles can manage all disputes
DROP POLICY IF EXISTS "disputes_manage_internal" ON "public"."disputes";
CREATE POLICY "disputes_manage_internal" ON "public"."disputes"
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

-- Portal users can SELECT disputes for their client
DROP POLICY IF EXISTS "disputes_select_portal" ON "public"."disputes";
CREATE POLICY "disputes_select_portal" ON "public"."disputes"
    FOR SELECT
    TO "authenticated"
    USING (
        EXISTS (
            SELECT 1 FROM "public"."portal_users" "pu"
            WHERE "pu"."client_id" = "disputes"."client_id"
            AND "pu"."status" = 'active'::"text"
            AND LOWER("pu"."email") = LOWER(("auth"."jwt"() ->> 'email'::"text"))
        )
    );

-- ============================================================================
-- PART E: State Machine Enforcement Functions and Triggers
-- ============================================================================

-- Function to validate route_stop status transitions
CREATE OR REPLACE FUNCTION "public"."validate_route_stop_status_transition"(
    "old_status" "public"."route_stop_status",
    "new_status" "public"."route_stop_status"
)
RETURNS boolean
LANGUAGE "plpgsql"
STABLE
AS $$
BEGIN
    -- Define allowed transitions
    IF old_status = 'queued' AND new_status IN ('in_progress', 'unable_to_complete') THEN
        RETURN true;
    ELSIF old_status = 'in_progress' AND new_status IN ('completed', 'completed_with_exceptions', 'unable_to_complete') THEN
        RETURN true;
    ELSIF old_status IN ('completed', 'completed_with_exceptions', 'unable_to_complete') THEN
        -- Terminal states: no transitions allowed
        RETURN false;
    ELSE
        RETURN false;
    END IF;
END;
$$;

COMMENT ON FUNCTION "public"."validate_route_stop_status_transition" IS 'Validates allowed status transitions for route_stops';

-- Function to validate route_stop completion invariants
CREATE OR REPLACE FUNCTION "public"."validate_route_stop_completion"(
    "p_route_stop_id" "uuid",
    "p_new_status" "public"."route_stop_status"
)
RETURNS boolean
LANGUAGE "plpgsql"
STABLE
AS $$
DECLARE
    v_signature_present boolean;
    v_item_count integer;
    v_completed_item_count integer;
    v_exception_item_count integer;
BEGIN
    -- Only validate for completion statuses
    IF p_new_status NOT IN ('completed', 'completed_with_exceptions') THEN
        RETURN true;
    END IF;

    -- Check signature is present
    SELECT "signature_data_url" IS NOT NULL INTO v_signature_present
    FROM "public"."route_stops"
    WHERE "id" = p_route_stop_id;

    IF NOT v_signature_present THEN
        RAISE EXCEPTION 'Cannot complete stop: signature is required';
    END IF;

    -- Count items and their statuses
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE "status" IN ('verified', 'skipped')),
        COUNT(*) FILTER (WHERE "status" IN ('disputed', 'exception'))
    INTO v_item_count, v_completed_item_count, v_exception_item_count
    FROM "public"."route_stop_items"
    WHERE "route_stop_id" = p_route_stop_id;

    -- For 'completed': all items must be verified or skipped
    IF p_new_status = 'completed' THEN
        IF v_item_count = 0 THEN
            RAISE EXCEPTION 'Cannot complete stop: no items found';
        END IF;
        IF v_completed_item_count < v_item_count THEN
            RAISE EXCEPTION 'Cannot complete stop: all items must be verified or skipped';
        END IF;
    END IF;

    -- For 'completed_with_exceptions': all items must be verified, skipped, disputed, or exception
    -- AND at least one must be disputed or exception
    IF p_new_status = 'completed_with_exceptions' THEN
        IF v_item_count = 0 THEN
            RAISE EXCEPTION 'Cannot complete stop: no items found';
        END IF;
        IF v_completed_item_count + v_exception_item_count < v_item_count THEN
            RAISE EXCEPTION 'Cannot complete stop: all items must be verified, skipped, disputed, or exception';
        END IF;
        IF v_exception_item_count = 0 THEN
            RAISE EXCEPTION 'Cannot complete stop with exceptions: at least one item must be disputed or exception';
        END IF;
    END IF;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION "public"."validate_route_stop_completion" IS 'Validates completion invariants: signature required, all items in appropriate states';

-- Trigger function to enforce status transitions and completion rules
CREATE OR REPLACE FUNCTION "public"."route_stops_status_transition_guard"()
RETURNS trigger
LANGUAGE "plpgsql"
AS $$
BEGIN
    -- If status is changing, validate transition
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF NOT "public"."validate_route_stop_status_transition"(OLD.status, NEW.status) THEN
            RAISE EXCEPTION 'Invalid status transition from % to %', OLD.status, NEW.status;
        END IF;

        -- If transitioning to completion status, validate completion invariants
        IF NEW.status IN ('completed', 'completed_with_exceptions') THEN
            IF NOT "public"."validate_route_stop_completion"(NEW.id, NEW.status) THEN
                -- Function raises exception on failure
                RETURN NULL;
            END IF;

            -- Set completed_at if not already set
            IF NEW.completed_at IS NULL THEN
                NEW.completed_at = NOW();
            END IF;
        END IF;

        -- If transitioning to in_progress, set started_at if not already set
        IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
            IF NEW.started_at IS NULL THEN
                NEW.started_at = NOW();
            END IF;
        END IF;

        -- Log status change to communication_events for audit
        INSERT INTO "public"."communication_events" (
            "client_id",
            "event_type",
            "channel",
            "direction",
            "subject",
            "body",
            "created_by"
        ) VALUES (
            NEW.client_id,
            'route_stop_status_changed',
            'in_app_chat',
            'outbound',
            'Route stop status changed',
            format('Route stop %s status changed from %s to %s', NEW.id, OLD.status, NEW.status),
            "auth"."uid"()
        );
    END IF;

    -- Update updated_at timestamp
    NEW.updated_at = NOW();

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "public"."route_stops_status_transition_guard" IS 'Trigger function enforcing status transitions and completion invariants';

-- Create trigger (drop first if exists for idempotency)
DROP TRIGGER IF EXISTS "route_stops_status_transition_trigger" ON "public"."route_stops";
CREATE TRIGGER "route_stops_status_transition_trigger"
    BEFORE UPDATE ON "public"."route_stops"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."route_stops_status_transition_guard"();

-- Function to validate route_stop_item status transitions
CREATE OR REPLACE FUNCTION "public"."validate_route_stop_item_status_transition"(
    "old_status" "public"."route_stop_item_status",
    "new_status" "public"."route_stop_item_status"
)
RETURNS boolean
LANGUAGE "plpgsql"
STABLE
AS $$
BEGIN
    -- Allow transitions from pending to any other status
    IF old_status = 'pending' THEN
        RETURN true;
    END IF;

    -- Allow transitions from verified to disputed or exception (for corrections)
    IF old_status = 'verified' AND new_status IN ('disputed', 'exception') THEN
        RETURN true;
    END IF;

    -- Terminal states: cannot transition from these
    IF old_status IN ('disputed', 'exception', 'skipped') AND new_status != old_status THEN
        -- Allow staying in same state, but not transitioning away
        RETURN false;
    END IF;

    -- Cannot transition back to pending
    IF new_status = 'pending' AND old_status != 'pending' THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$;

COMMENT ON FUNCTION "public"."validate_route_stop_item_status_transition" IS 'Validates allowed status transitions for route_stop_items';

-- Trigger function for route_stop_items status transitions
CREATE OR REPLACE FUNCTION "public"."route_stop_items_status_transition_guard"()
RETURNS trigger
LANGUAGE "plpgsql"
AS $$
BEGIN
    -- If status is changing, validate transition
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF NOT "public"."validate_route_stop_item_status_transition"(OLD.status, NEW.status) THEN
            RAISE EXCEPTION 'Invalid item status transition from % to %', OLD.status, NEW.status;
        END IF;
    END IF;

    -- Update updated_at timestamp
    NEW.updated_at = NOW();

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION "public"."route_stop_items_status_transition_guard" IS 'Trigger function enforcing item status transitions';

-- Create trigger (drop first if exists for idempotency)
DROP TRIGGER IF EXISTS "route_stop_items_status_transition_trigger" ON "public"."route_stop_items";
CREATE TRIGGER "route_stop_items_status_transition_trigger"
    BEFORE UPDATE ON "public"."route_stop_items"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."route_stop_items_status_transition_guard"();

-- ============================================================================
-- PART F: Stop Build Function
-- ============================================================================

-- Function to build route_stops for a given date from delivery_lists and pickup_requests
CREATE OR REPLACE FUNCTION "public"."build_route_stops_for_date"("target_date" "date")
RETURNS TABLE (
    "stops_created" integer,
    "stops_updated" integer,
    "items_created" integer
)
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
DECLARE
    v_stop_record "public"."route_stops"%ROWTYPE;
    v_stops_created integer := 0;
    v_stops_updated integer := 0;
    v_items_created integer := 0;
    v_items_count integer;
    v_client_id "uuid";
    v_route_day "text";
    v_delivery_list_id "uuid";
    v_pickup_request_id "uuid";
    v_assigned_driver_id "uuid";
BEGIN
    -- Process delivery items: group by client_id
    FOR v_client_id, v_route_day, v_delivery_list_id IN
        SELECT DISTINCT
            "dli"."client_id",
            "dl"."route_day",
            "dl"."id" AS "delivery_list_id"
        FROM "public"."delivery_list_items" "dli"
        INNER JOIN "public"."delivery_lists" "dl" ON "dl"."id" = "dli"."delivery_list_id"
        WHERE "dl"."target_date" = target_date
        AND "dl"."status" IN ('confirmed', 'checked_out')
        AND "dli"."confirmed_for_delivery" = true
        AND "dli"."client_id" IS NOT NULL
    LOOP
        -- Get assigned driver from delivery list (if any) or pickup request
        SELECT "pr"."assigned_driver_id" INTO v_assigned_driver_id
        FROM "public"."pickup_requests" "pr"
        WHERE "pr"."client_id" = v_client_id
        AND "pr"."scheduled_date" = target_date
        AND "pr"."status" = 'assigned'
        AND "pr"."assigned_driver_id" IS NOT NULL
        LIMIT 1;

        -- Insert or update route_stop
        INSERT INTO "public"."route_stops" (
            "route_date",
            "client_id",
            "route_day",
            "assigned_driver_id",
            "delivery_list_id",
            "status"
        ) VALUES (
            target_date,
            v_client_id,
            v_route_day,
            v_assigned_driver_id,
            v_delivery_list_id,
            'queued'::"public"."route_stop_status"
        )
        ON CONFLICT ("client_id", "route_date")
        DO UPDATE SET
            "delivery_list_id" = EXCLUDED."delivery_list_id",
            "assigned_driver_id" = COALESCE(EXCLUDED."assigned_driver_id", "route_stops"."assigned_driver_id"),
            "updated_at" = NOW()
        RETURNING * INTO v_stop_record;

        IF FOUND THEN
            IF (SELECT COUNT(*) FROM "public"."route_stops" WHERE "id" = v_stop_record."id" AND "created_at" > NOW() - INTERVAL '1 second') > 0 THEN
                v_stops_created := v_stops_created + 1;
            ELSE
                v_stops_updated := v_stops_updated + 1;
            END IF;
        END IF;

        -- Create route_stop_items for delivery items
        INSERT INTO "public"."route_stop_items" (
            "route_stop_id",
            "phase",
            "status",
            "rug_id",
            "delivery_list_item_id"
        )
        SELECT
            v_stop_record."id",
            'delivery'::"public"."route_stop_phase",
            'pending'::"public"."route_stop_item_status",
            "dli"."rug_id",
            "dli"."id"
        FROM "public"."delivery_list_items" "dli"
        WHERE "dli"."delivery_list_id" = v_delivery_list_id
        AND "dli"."confirmed_for_delivery" = true
        AND "dli"."client_id" = v_client_id
        AND NOT EXISTS (
            SELECT 1 FROM "public"."route_stop_items" "rsi"
            WHERE "rsi"."route_stop_id" = v_stop_record."id"
            AND "rsi"."delivery_list_item_id" = "dli"."id"
        );

        GET DIAGNOSTICS v_items_count = ROW_COUNT;
        v_items_created := v_items_created + v_items_count;
    END LOOP;

    -- Process pickup requests: attach to existing stops or create new ones
    FOR v_client_id, v_route_day, v_pickup_request_id, v_assigned_driver_id IN
        SELECT DISTINCT
            "pr"."client_id",
            "pr"."route_day",
            "pr"."id" AS "pickup_request_id",
            "pr"."assigned_driver_id"
        FROM "public"."pickup_requests" "pr"
        WHERE "pr"."scheduled_date" = target_date
        AND "pr"."status" = 'assigned'
        AND "pr"."assigned_driver_id" IS NOT NULL
    LOOP
        -- Get or create route_stop for this client/date
        INSERT INTO "public"."route_stops" (
            "route_date",
            "client_id",
            "route_day",
            "assigned_driver_id",
            "pickup_request_id",
            "status"
        ) VALUES (
            target_date,
            v_client_id,
            v_route_day,
            v_assigned_driver_id,
            v_pickup_request_id,
            'queued'::"public"."route_stop_status"
        )
        ON CONFLICT ("client_id", "route_date")
        DO UPDATE SET
            "pickup_request_id" = EXCLUDED."pickup_request_id",
            "assigned_driver_id" = EXCLUDED."assigned_driver_id",
            "updated_at" = NOW()
        RETURNING * INTO v_stop_record;

        IF FOUND THEN
            IF (SELECT COUNT(*) FROM "public"."route_stops" WHERE "id" = v_stop_record."id" AND "created_at" > NOW() - INTERVAL '1 second') > 0 THEN
                v_stops_created := v_stops_created + 1;
            ELSE
                v_stops_updated := v_stops_updated + 1;
            END IF;
        END IF;

        -- Create route_stop_items for pickup items
        INSERT INTO "public"."route_stop_items" (
            "route_stop_id",
            "phase",
            "status",
            "rug_id",
            "pickup_request_item_id"
        )
        SELECT
            v_stop_record."id",
            'pickup'::"public"."route_stop_phase",
            'pending'::"public"."route_stop_item_status",
            "pri"."rug_id",
            "pri"."id"
        FROM "public"."pickup_request_items" "pri"
        WHERE "pri"."pickup_request_id" = v_pickup_request_id
        AND NOT EXISTS (
            SELECT 1 FROM "public"."route_stop_items" "rsi"
            WHERE "rsi"."route_stop_id" = v_stop_record."id"
            AND "rsi"."pickup_request_item_id" = "pri"."id"
        );

        GET DIAGNOSTICS v_items_count = ROW_COUNT;
        v_items_created := v_items_created + v_items_count;
    END LOOP;

    RETURN QUERY SELECT v_stops_created, v_stops_updated, v_items_created;
END;
$$;

COMMENT ON FUNCTION "public"."build_route_stops_for_date" IS 'Builds route_stops for a target_date from delivery_lists and pickup_requests. Idempotent: can be run multiple times safely.';

-- ============================================================================
-- PART G: Grant Permissions
-- ============================================================================

-- Grant necessary permissions to authenticated users (RLS will enforce scoping)
GRANT SELECT, INSERT, UPDATE ON "public"."route_stops" TO "authenticated";
GRANT SELECT, INSERT, UPDATE ON "public"."route_stop_items" TO "authenticated";
GRANT SELECT, INSERT ON "public"."route_stop_events" TO "authenticated";
GRANT SELECT, INSERT, UPDATE ON "public"."disputes" TO "authenticated";

-- Grant usage on types
GRANT USAGE ON TYPE "public"."route_stop_status" TO "authenticated";
GRANT USAGE ON TYPE "public"."route_stop_phase" TO "authenticated";
GRANT USAGE ON TYPE "public"."route_stop_item_status" TO "authenticated";
GRANT USAGE ON TYPE "public"."dispute_type" TO "authenticated";
GRANT USAGE ON TYPE "public"."dispute_status" TO "authenticated";

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION "public"."build_route_stops_for_date"("date") TO "authenticated";
