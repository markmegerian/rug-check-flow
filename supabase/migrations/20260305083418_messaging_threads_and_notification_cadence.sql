-- PR-6: Implement best-practice messaging threads + sane email cadence

-- Create thread_type enum
CREATE TYPE "public"."thread_type" AS ENUM ('general', 'estimate', 'invoice');
ALTER TYPE "public"."thread_type" OWNER TO "postgres";

-- Create thread_status enum
CREATE TYPE "public"."thread_status" AS ENUM ('active', 'closed', 'archived');
ALTER TYPE "public"."thread_status" OWNER TO "postgres";

-- Create message_threads table
CREATE TABLE IF NOT EXISTS "public"."message_threads" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "client_id" uuid NOT NULL,
    "thread_type" "public"."thread_type" NOT NULL,
    "entity_id" uuid,
    "status" "public"."thread_status" DEFAULT 'active'::"public"."thread_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "message_threads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "message_threads_client_id_fkey" FOREIGN KEY ("client_id") 
        REFERENCES "public"."clients"("id") ON DELETE CASCADE,
    CONSTRAINT "message_threads_entity_id_check" CHECK (
        (thread_type = 'general' AND entity_id IS NULL) OR
        (thread_type IN ('estimate', 'invoice') AND entity_id IS NOT NULL)
    )
);

ALTER TABLE "public"."message_threads" OWNER TO "postgres";

-- Create messages table
CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "thread_id" uuid NOT NULL,
    "sender" uuid,
    "body" text DEFAULT ''::text NOT NULL,
    "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") 
        REFERENCES "public"."message_threads"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."messages" OWNER TO "postgres";

-- Create indexes
CREATE INDEX IF NOT EXISTS "message_threads_client_id_idx" ON "public"."message_threads"("client_id");
CREATE INDEX IF NOT EXISTS "message_threads_entity_id_idx" ON "public"."message_threads"("entity_id");
CREATE INDEX IF NOT EXISTS "message_threads_type_entity_idx" ON "public"."message_threads"("thread_type", "entity_id");
CREATE INDEX IF NOT EXISTS "messages_thread_id_idx" ON "public"."messages"("thread_id");
CREATE INDEX IF NOT EXISTS "messages_created_at_idx" ON "public"."messages"("created_at");

-- Create notification_cadence table to track automated emails
CREATE TABLE IF NOT EXISTS "public"."notification_cadence" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "client_id" uuid NOT NULL,
    "entity_type" text NOT NULL,
    "entity_id" uuid,
    "notification_type" text NOT NULL,
    "scheduled_for" timestamp with time zone NOT NULL,
    "sent_at" timestamp with time zone,
    "throttle_key" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "notification_cadence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_cadence_client_id_fkey" FOREIGN KEY ("client_id") 
        REFERENCES "public"."clients"("id") ON DELETE CASCADE,
    CONSTRAINT "notification_cadence_unique" UNIQUE ("client_id", "entity_type", "entity_id", "notification_type", "throttle_key")
);

ALTER TABLE "public"."notification_cadence" OWNER TO "postgres";

-- Create indexes for notification cadence
CREATE INDEX IF NOT EXISTS "notification_cadence_client_id_idx" ON "public"."notification_cadence"("client_id");
CREATE INDEX IF NOT EXISTS "notification_cadence_scheduled_for_idx" ON "public"."notification_cadence"("scheduled_for");
CREATE INDEX IF NOT EXISTS "notification_cadence_throttle_key_idx" ON "public"."notification_cadence"("throttle_key");
CREATE INDEX IF NOT EXISTS "notification_cadence_sent_at_idx" ON "public"."notification_cadence"("sent_at");

-- Function to update thread updated_at
CREATE OR REPLACE FUNCTION "public"."update_thread_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE "public"."message_threads"
    SET updated_at = now()
    WHERE id = NEW.thread_id;
    RETURN NEW;
END;
$$;

-- Trigger to update thread when message is added
CREATE TRIGGER "update_thread_on_message"
    AFTER INSERT ON "public"."messages"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."update_thread_updated_at"();

-- Function to check throttle limit (max 1 automated email per client per 72h)
CREATE OR REPLACE FUNCTION "public"."check_notification_throttle"(
    p_client_id uuid,
    p_throttle_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    recent_count integer;
BEGIN
    SELECT COUNT(*) INTO recent_count
    FROM "public"."notification_cadence"
    WHERE client_id = p_client_id
      AND throttle_key = p_throttle_key
      AND sent_at IS NOT NULL
      AND sent_at > now() - INTERVAL '72 hours';
    
    RETURN recent_count = 0;
END;
$$;

-- Function to schedule estimate notifications
CREATE OR REPLACE FUNCTION "public"."schedule_estimate_notifications"(
    p_estimate_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_estimate RECORD;
    v_client_id uuid;
    v_sent_at timestamp with time zone;
BEGIN
    -- Get estimate details
    SELECT client_id, sent_at INTO v_client_id, v_sent_at
    FROM "public"."estimates"
    WHERE id = p_estimate_id;
    
    IF v_client_id IS NULL OR v_sent_at IS NULL THEN
        RETURN;
    END IF;
    
    -- Schedule initial send (at sent_at)
    INSERT INTO "public"."notification_cadence" (
        client_id, entity_type, entity_id, notification_type, scheduled_for, throttle_key
    ) VALUES (
        v_client_id, 'estimate', p_estimate_id, 'estimate_sent', v_sent_at, 
        'estimate_' || p_estimate_id::text || '_sent'
    )
    ON CONFLICT (client_id, entity_type, entity_id, notification_type, throttle_key) DO NOTHING;
    
    -- Schedule reminders: +24h, +72h, +7d
    INSERT INTO "public"."notification_cadence" (
        client_id, entity_type, entity_id, notification_type, scheduled_for, throttle_key
    ) VALUES
        (v_client_id, 'estimate', p_estimate_id, 'estimate_reminder_24h', v_sent_at + INTERVAL '24 hours', 
         'estimate_' || p_estimate_id::text || '_reminder_24h'),
        (v_client_id, 'estimate', p_estimate_id, 'estimate_reminder_72h', v_sent_at + INTERVAL '72 hours', 
         'estimate_' || p_estimate_id::text || '_reminder_72h'),
        (v_client_id, 'estimate', p_estimate_id, 'estimate_reminder_7d', v_sent_at + INTERVAL '7 days', 
         'estimate_' || p_estimate_id::text || '_reminder_7d')
    ON CONFLICT (client_id, entity_type, entity_id, notification_type, throttle_key) DO NOTHING;
END;
$$;

-- Function to schedule invoice notifications
CREATE OR REPLACE FUNCTION "public"."schedule_invoice_notifications"(
    p_invoice_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_invoice RECORD;
    v_client_id uuid;
    v_due_at timestamp with time zone;
    v_issued_at timestamp with time zone;
BEGIN
    -- Get invoice details
    SELECT client_id, due_at, issued_at INTO v_client_id, v_due_at, v_issued_at
    FROM "public"."invoices"
    WHERE id = p_invoice_id;
    
    IF v_client_id IS NULL THEN
        RETURN;
    END IF;
    
    -- Schedule reminders if due_at exists: -3d, on due date, +7d overdue, +14d overdue
    -- Use shared throttle key for all collections emails per client
    IF v_due_at IS NOT NULL THEN
        INSERT INTO "public"."notification_cadence" (
            client_id, entity_type, entity_id, notification_type, scheduled_for, throttle_key
        ) VALUES
            (v_client_id, 'invoice', p_invoice_id, 'invoice_reminder_3d_before', v_due_at - INTERVAL '3 days', 
             'collections_' || v_client_id::text),
            (v_client_id, 'invoice', p_invoice_id, 'invoice_reminder_due', v_due_at, 
             'collections_' || v_client_id::text),
            (v_client_id, 'invoice', p_invoice_id, 'invoice_reminder_7d_overdue', v_due_at + INTERVAL '7 days', 
             'collections_' || v_client_id::text),
            (v_client_id, 'invoice', p_invoice_id, 'invoice_reminder_14d_overdue', v_due_at + INTERVAL '14 days', 
             'collections_' || v_client_id::text)
        ON CONFLICT (client_id, entity_type, entity_id, notification_type, throttle_key) DO NOTHING;
    END IF;
END;
$$;

-- Trigger to schedule estimate notifications when sent_at is set
CREATE OR REPLACE FUNCTION "public"."trigger_schedule_estimate_notifications"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.sent_at IS NOT NULL AND (OLD.sent_at IS NULL OR OLD.sent_at IS DISTINCT FROM NEW.sent_at) THEN
        PERFORM schedule_estimate_notifications(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "schedule_estimate_notifications_trigger"
    AFTER INSERT OR UPDATE ON "public"."estimates"
    FOR EACH ROW
    WHEN (NEW.sent_at IS NOT NULL)
    EXECUTE FUNCTION "public"."trigger_schedule_estimate_notifications"();

-- Trigger to schedule invoice notifications when status changes to sent
CREATE OR REPLACE FUNCTION "public"."trigger_schedule_invoice_notifications"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent') THEN
        PERFORM schedule_invoice_notifications(NEW.id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "schedule_invoice_notifications_trigger"
    AFTER INSERT OR UPDATE ON "public"."invoices"
    FOR EACH ROW
    WHEN (NEW.status = 'sent')
    EXECUTE FUNCTION "public"."trigger_schedule_invoice_notifications"();

-- Function to get pending notifications (respecting throttle)
CREATE OR REPLACE FUNCTION "public"."get_pending_notifications"()
RETURNS TABLE (
    id uuid,
    client_id uuid,
    entity_type text,
    entity_id uuid,
    notification_type text,
    scheduled_for timestamp with time zone,
    throttle_key text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        nc.id,
        nc.client_id,
        nc.entity_type,
        nc.entity_id,
        nc.notification_type,
        nc.scheduled_for,
        nc.throttle_key
    FROM "public"."notification_cadence" nc
    WHERE nc.sent_at IS NULL
      AND nc.scheduled_for <= now()
      AND check_notification_throttle(nc.client_id, nc.throttle_key);
END;
$$;

-- Function to mark notification as sent
CREATE OR REPLACE FUNCTION "public"."mark_notification_sent"(
    p_notification_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE "public"."notification_cadence"
    SET sent_at = now()
    WHERE id = p_notification_id
      AND sent_at IS NULL;
END;
$$;

-- Function to get clients needing weekly statements
-- This should be called weekly (e.g., via cron) to send statements for all open invoices
CREATE OR REPLACE FUNCTION "public"."get_clients_for_weekly_statements"()
RETURNS TABLE (
    client_id uuid,
    client_name text,
    client_email text,
    open_invoice_count bigint,
    total_balance numeric
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        c.id as client_id,
        c.name as client_name,
        c.email as client_email,
        COUNT(i.id) FILTER (WHERE i.status IN ('sent', 'overdue', 'disputed') AND i.balance > 0) as open_invoice_count,
        COALESCE(SUM(i.balance) FILTER (WHERE i.status IN ('sent', 'overdue', 'disputed') AND i.balance > 0), 0) as total_balance
    FROM "public"."clients" c
    LEFT JOIN "public"."invoices" i ON i.client_id = c.id
    WHERE i.status IN ('sent', 'overdue', 'disputed')
      AND i.balance > 0
    GROUP BY c.id, c.name, c.email
    HAVING COUNT(i.id) FILTER (WHERE i.status IN ('sent', 'overdue', 'disputed') AND i.balance > 0) > 0
      AND check_notification_throttle(c.id, 'collections_' || c.id::text);
END;
$$;

-- Enable RLS
ALTER TABLE "public"."message_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notification_cadence" ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Portal users can only see/insert messages for their client_id
CREATE POLICY "portal_users_message_threads_select" ON "public"."message_threads"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."portal_users" pu
            WHERE pu.client_id = message_threads.client_id
              AND pu.status = 'active'
              AND lower(pu.email) = lower(auth.jwt() ->> 'email')
        )
    );

CREATE POLICY "portal_users_message_threads_insert" ON "public"."message_threads"
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."portal_users" pu
            WHERE pu.client_id = message_threads.client_id
              AND pu.status = 'active'
              AND lower(pu.email) = lower(auth.jwt() ->> 'email')
        )
    );

CREATE POLICY "portal_users_messages_select" ON "public"."messages"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "public"."message_threads" mt
            JOIN "public"."portal_users" pu ON pu.client_id = mt.client_id
            WHERE mt.id = messages.thread_id
              AND pu.status = 'active'
              AND lower(pu.email) = lower(auth.jwt() ->> 'email')
        )
    );

CREATE POLICY "portal_users_messages_insert" ON "public"."messages"
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."message_threads" mt
            JOIN "public"."portal_users" pu ON pu.client_id = mt.client_id
            WHERE mt.id = messages.thread_id
              AND pu.status = 'active'
              AND lower(pu.email) = lower(auth.jwt() ->> 'email')
        )
    );

-- RLS Policy: Internal roles (office, admin, staff) can see all
CREATE POLICY "internal_roles_message_threads_all" ON "public"."message_threads"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."user_roles" ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('office', 'admin', 'staff')
        )
    );

CREATE POLICY "internal_roles_messages_all" ON "public"."messages"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."user_roles" ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('office', 'admin', 'staff')
        )
    );

-- RLS Policy: Internal roles can manage notification cadence
CREATE POLICY "internal_roles_notification_cadence_all" ON "public"."notification_cadence"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "public"."user_roles" ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('office', 'admin', 'staff')
        )
    );

-- Function to create or get thread for entity
CREATE OR REPLACE FUNCTION "public"."get_or_create_thread"(
    p_client_id uuid,
    p_thread_type "public"."thread_type",
    p_entity_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    v_thread_id uuid;
BEGIN
    -- Try to find existing thread
    IF p_entity_id IS NOT NULL THEN
        SELECT id INTO v_thread_id
        FROM "public"."message_threads"
        WHERE client_id = p_client_id
          AND thread_type = p_thread_type
          AND entity_id = p_entity_id
        LIMIT 1;
    ELSE
        SELECT id INTO v_thread_id
        FROM "public"."message_threads"
        WHERE client_id = p_client_id
          AND thread_type = p_thread_type
          AND entity_id IS NULL
        LIMIT 1;
    END IF;
    
    -- Create if not found
    IF v_thread_id IS NULL THEN
        INSERT INTO "public"."message_threads" (client_id, thread_type, entity_id)
        VALUES (p_client_id, p_thread_type, p_entity_id)
        RETURNING id INTO v_thread_id;
    END IF;
    
    RETURN v_thread_id;
END;
$$;
