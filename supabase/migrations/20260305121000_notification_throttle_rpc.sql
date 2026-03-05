-- Notification throttle RPC function for PostgREST
-- Makes check_notification_throttle callable via rpc/check_notification_throttle

-- Create notification_throttles table to track last sent time per client/throttle_key
CREATE TABLE IF NOT EXISTS "public"."notification_throttles" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "client_id" uuid NOT NULL,
    "throttle_key" text NOT NULL,
    "last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "notification_throttles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_throttles_client_id_fkey" FOREIGN KEY ("client_id") 
        REFERENCES "public"."clients"("id") ON DELETE CASCADE,
    CONSTRAINT "notification_throttles_unique" UNIQUE ("client_id", "throttle_key")
);

ALTER TABLE "public"."notification_throttles" OWNER TO "postgres";

-- Create indexes
CREATE INDEX IF NOT EXISTS "notification_throttles_client_id_idx" ON "public"."notification_throttles"("client_id");
CREATE INDEX IF NOT EXISTS "notification_throttles_throttle_key_idx" ON "public"."notification_throttles"("throttle_key");
CREATE INDEX IF NOT EXISTS "notification_throttles_last_sent_at_idx" ON "public"."notification_throttles"("last_sent_at");

-- Function to check notification throttle (STABLE, read-only)
-- Returns whether sending is allowed and retry_after_seconds if throttled
CREATE OR REPLACE FUNCTION "public"."check_notification_throttle"(
    "client_id" uuid,
    "p_throttle_key" text
)
RETURNS TABLE (
    "allowed" boolean,
    "retry_after_seconds" integer
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    throttle_window_seconds integer := 172800; -- 48 hours
    last_sent timestamp with time zone;
    seconds_since_last_sent integer;
BEGIN
    -- Get last sent time for this client/throttle_key combination
    SELECT last_sent_at INTO last_sent
    FROM "public"."notification_throttles"
    WHERE notification_throttles.client_id = check_notification_throttle.client_id
      AND notification_throttles.throttle_key = check_notification_throttle.p_throttle_key
    LIMIT 1;
    
    -- If no record exists, allow sending
    IF last_sent IS NULL THEN
        RETURN QUERY SELECT true::boolean, 0::integer;
        RETURN;
    END IF;
    
    -- Calculate seconds since last sent
    seconds_since_last_sent := EXTRACT(EPOCH FROM (now() - last_sent))::integer;
    
    -- If within throttle window, deny and return retry_after
    IF seconds_since_last_sent < throttle_window_seconds THEN
        RETURN QUERY SELECT false::boolean, (throttle_window_seconds - seconds_since_last_sent)::integer;
        RETURN;
    END IF;
    
    -- Outside throttle window, allow sending
    RETURN QUERY SELECT true::boolean, 0::integer;
END;
$$;

-- Function to record notification throttle (VOLATILE, for writer paths)
CREATE OR REPLACE FUNCTION "public"."record_notification_throttle"(
    "client_id" uuid,
    "p_throttle_key" text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
AS $$
BEGIN
    INSERT INTO "public"."notification_throttles" (client_id, throttle_key, last_sent_at)
    VALUES (record_notification_throttle.client_id, record_notification_throttle.p_throttle_key, now())
    ON CONFLICT (client_id, throttle_key)
    DO UPDATE SET
        last_sent_at = now(),
        updated_at = now();
END;
$$;

-- Enable RLS
ALTER TABLE "public"."notification_throttles" ENABLE ROW LEVEL SECURITY;

-- Office/admin can manage all
DROP POLICY IF EXISTS "office_admin_manage_notification_throttles" ON "public"."notification_throttles";
CREATE POLICY "office_admin_manage_notification_throttles" ON "public"."notification_throttles"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."user_roles"
            WHERE user_id = auth.uid() AND role IN ('office', 'admin')
        )
    );

-- Portal can SELECT only scoped to their client (match invoices_select_scoped pattern)
DROP POLICY IF EXISTS "portal_select_notification_throttles" ON "public"."notification_throttles";
CREATE POLICY "portal_select_notification_throttles" ON "public"."notification_throttles"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."portal_users" pu
            WHERE pu.client_id = notification_throttles.client_id
              AND pu.status = 'active'
              AND lower(pu.email) = lower(auth.jwt() ->> 'email')
        )
    );

-- Grant execute on functions to authenticated users
GRANT EXECUTE ON FUNCTION "public"."check_notification_throttle"(uuid, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."record_notification_throttle"(uuid, text) TO "authenticated";
