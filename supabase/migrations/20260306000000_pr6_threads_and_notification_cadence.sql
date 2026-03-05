-- PR-6: Implement message threads + automated billing notification cadence

CREATE TABLE IF NOT EXISTS public.message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  thread_type text NOT NULL CHECK (thread_type IN ('general', 'estimate', 'invoice')),
  entity_id uuid,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, thread_type, entity_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('portal', 'internal', 'system')),
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_threads_client_id ON public.message_threads(client_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_id_created_at ON public.messages(thread_id, created_at DESC);

DROP TRIGGER IF EXISTS set_message_threads_updated_at ON public.message_threads;
CREATE TRIGGER set_message_threads_updated_at
BEFORE UPDATE ON public.message_threads
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.message_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_threads_select_scoped ON public.message_threads;
CREATE POLICY message_threads_select_scoped
ON public.message_threads
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
  OR public.has_role(auth.uid(), 'driver'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = message_threads.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS message_threads_insert_scoped ON public.message_threads;
CREATE POLICY message_threads_insert_scoped
ON public.message_threads
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
  OR public.has_role(auth.uid(), 'driver'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = message_threads.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS message_threads_update_internal ON public.message_threads;
CREATE POLICY message_threads_update_internal
ON public.message_threads
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

DROP POLICY IF EXISTS messages_select_scoped ON public.messages;
CREATE POLICY messages_select_scoped
ON public.messages
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
  OR public.has_role(auth.uid(), 'driver'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.message_threads mt
    JOIN public.portal_users pu ON pu.client_id = mt.client_id
    WHERE mt.id = messages.thread_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS messages_insert_scoped ON public.messages;
CREATE POLICY messages_insert_scoped
ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
  OR public.has_role(auth.uid(), 'driver'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.message_threads mt
    JOIN public.portal_users pu ON pu.client_id = mt.client_id
    WHERE mt.id = messages.thread_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS messages_update_internal ON public.messages;
CREATE POLICY messages_update_internal
ON public.messages
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE TABLE IF NOT EXISTS public.automation_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  notification_kind text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('estimate', 'invoice', 'statement')),
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_kind, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_notification_log_client_created
  ON public.automation_notification_log(client_id, created_at DESC);

ALTER TABLE public.automation_notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_notification_log_internal_read ON public.automation_notification_log;
CREATE POLICY automation_notification_log_internal_read
ON public.automation_notification_log
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

DROP POLICY IF EXISTS automation_notification_log_service_insert ON public.automation_notification_log;
CREATE POLICY automation_notification_log_service_insert
ON public.automation_notification_log
FOR INSERT TO service_role
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.queue_billing_automation_notifications(p_now timestamptz DEFAULT now())
RETURNS TABLE (notification_kind text, client_id uuid, entity_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  -- Estimate send + reminders at sent_at, +24h, +72h, +7d
  RETURN QUERY
  WITH estimate_candidates AS (
    SELECT
      e.client_id,
      e.id AS estimate_id,
      x.notification_kind,
      x.scheduled_for
    FROM public.estimates e
    CROSS JOIN LATERAL (
      VALUES
        ('estimate_sent', e.sent_at),
        ('estimate_reminder_24h', e.sent_at + interval '24 hours'),
        ('estimate_reminder_72h', e.sent_at + interval '72 hours'),
        ('estimate_reminder_7d', e.sent_at + interval '7 days')
    ) AS x(notification_kind, scheduled_for)
    WHERE e.sent_at IS NOT NULL
      AND e.status = 'sent'
      AND x.scheduled_for <= p_now
      AND NOT EXISTS (
        SELECT 1
        FROM public.automation_notification_log anl
        WHERE anl.notification_kind = x.notification_kind
          AND anl.entity_type = 'estimate'
          AND anl.entity_id = e.id
      )
  ), inserted AS (
    INSERT INTO public.automation_notification_log (
      client_id,
      notification_kind,
      entity_type,
      entity_id,
      payload
    )
    SELECT
      ec.client_id,
      ec.notification_kind,
      'estimate',
      ec.estimate_id,
      jsonb_build_object('scheduled_for', ec.scheduled_for)
    FROM estimate_candidates ec
    ON CONFLICT (notification_kind, entity_type, entity_id) DO NOTHING
    RETURNING notification_kind, client_id, entity_id
  )
  SELECT i.notification_kind, i.client_id, i.entity_id FROM inserted i;

  -- Invoice reminder cadence + weekly statements; throttled at 1 collections email / client / 72h
  FOR v_client_id IN
    SELECT DISTINCT i.client_id
    FROM public.invoices i
    WHERE i.client_id IS NOT NULL
      AND i.status IN ('sent', 'overdue')
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.automation_notification_log anl
      WHERE anl.client_id = v_client_id
        AND anl.notification_kind LIKE 'invoice_%'
        AND anl.created_at > (p_now - interval '72 hours')
    ) THEN
      CONTINUE;
    END IF;

    RETURN QUERY
    WITH invoice_candidates AS (
      SELECT
        i.client_id,
        i.id AS invoice_id,
        x.notification_kind,
        x.scheduled_for,
        x.requires_due_at
      FROM public.invoices i
      CROSS JOIN LATERAL (
        VALUES
          ('invoice_reminder_minus_3d', i.due_at - interval '3 days', true),
          ('invoice_due_date', i.due_at, true),
          ('invoice_overdue_7d', i.due_at + interval '7 days', true),
          ('invoice_overdue_14d', i.due_at + interval '14 days', true)
      ) AS x(notification_kind, scheduled_for, requires_due_at)
      WHERE i.client_id = v_client_id
        AND i.status IN ('sent', 'overdue')
        AND (NOT x.requires_due_at OR i.due_at IS NOT NULL)
        AND x.scheduled_for <= p_now
        AND NOT EXISTS (
          SELECT 1
          FROM public.automation_notification_log anl
          WHERE anl.notification_kind = x.notification_kind
            AND anl.entity_type = 'invoice'
            AND anl.entity_id = i.id
        )
      ORDER BY x.scheduled_for
      LIMIT 1
    ), inserted_invoice AS (
      INSERT INTO public.automation_notification_log (
        client_id,
        notification_kind,
        entity_type,
        entity_id,
        payload
      )
      SELECT
        ic.client_id,
        ic.notification_kind,
        'invoice',
        ic.invoice_id,
        jsonb_build_object('scheduled_for', ic.scheduled_for)
      FROM invoice_candidates ic
      ON CONFLICT (notification_kind, entity_type, entity_id) DO NOTHING
      RETURNING notification_kind, client_id, entity_id
    )
    SELECT ii.notification_kind, ii.client_id, ii.entity_id FROM inserted_invoice ii;

    IF NOT FOUND AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.client_id = v_client_id
        AND i.status IN ('sent', 'overdue')
        AND i.due_at <= (p_now - interval '14 days')
    ) AND NOT EXISTS (
      SELECT 1
      FROM public.automation_notification_log anl
      WHERE anl.client_id = v_client_id
        AND anl.notification_kind = 'invoice_weekly_statement'
        AND anl.created_at > (p_now - interval '7 days')
    ) THEN
      RETURN QUERY
      WITH inserted_statement AS (
        INSERT INTO public.automation_notification_log (
          client_id,
          notification_kind,
          entity_type,
          entity_id,
          payload
        ) VALUES (
          v_client_id,
          'invoice_weekly_statement',
          'statement',
          NULL,
          jsonb_build_object(
            'open_invoice_ids', (
              SELECT jsonb_agg(i.id ORDER BY i.due_at NULLS LAST, i.created_at)
              FROM public.invoices i
              WHERE i.client_id = v_client_id
                AND i.status IN ('sent', 'overdue')
            )
          )
        )
        ON CONFLICT (notification_kind, entity_type, entity_id) DO NOTHING
        RETURNING notification_kind, client_id, entity_id
      )
      SELECT is2.notification_kind, is2.client_id, is2.entity_id FROM inserted_statement is2;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_billing_automation_notifications(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_billing_automation_notifications(timestamptz) TO service_role;
