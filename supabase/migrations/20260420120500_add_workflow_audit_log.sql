-- Immutable audit log for the workflow-critical tables.
--
-- The existing admin_audit_logs table is admin-action scoped; this migration
-- introduces workflow_audit_log, which captures every INSERT / UPDATE / DELETE
-- against rugs, invoices, estimates, route_stops, and pickup_requests with the
-- before and after row snapshots. That gives ops a single place to answer
-- "who changed the invoice total and when?" without parsing Postgres WAL.
--
-- Writes are trigger-driven, so application code does not need to emit audit
-- events explicitly. The table is append-only: a row-level security policy
-- forbids UPDATE and DELETE for every non-superuser role, and the triggers
-- themselves run with SECURITY DEFINER so they are unaffected by per-table RLS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.workflow_audit_log (
  id           bigserial PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid,
  table_name   text NOT NULL,
  entity_id    uuid,
  action       text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  row_before   jsonb,
  row_after    jsonb
);

CREATE INDEX IF NOT EXISTS workflow_audit_log_table_entity_idx
  ON public.workflow_audit_log (table_name, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS workflow_audit_log_actor_idx
  ON public.workflow_audit_log (actor_id, occurred_at DESC);

ALTER TABLE public.workflow_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_audit_log_read ON public.workflow_audit_log;
CREATE POLICY workflow_audit_log_read
  ON public.workflow_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin', 'office')
    )
  );

DROP POLICY IF EXISTS workflow_audit_log_no_update ON public.workflow_audit_log;
CREATE POLICY workflow_audit_log_no_update
  ON public.workflow_audit_log
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS workflow_audit_log_no_delete ON public.workflow_audit_log;
CREATE POLICY workflow_audit_log_no_delete
  ON public.workflow_audit_log
  FOR DELETE
  USING (false);

-- Inserts happen only via the trigger, which runs SECURITY DEFINER.
DROP POLICY IF EXISTS workflow_audit_log_no_insert ON public.workflow_audit_log;
CREATE POLICY workflow_audit_log_no_insert
  ON public.workflow_audit_log
  FOR INSERT
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.record_workflow_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entity uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    entity := (to_jsonb(OLD) ->> 'id')::uuid;
    INSERT INTO public.workflow_audit_log
      (actor_id, table_name, entity_id, action, row_before, row_after)
    VALUES
      (auth.uid(), TG_TABLE_NAME, entity, 'DELETE', to_jsonb(OLD), NULL);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    entity := (to_jsonb(NEW) ->> 'id')::uuid;
    INSERT INTO public.workflow_audit_log
      (actor_id, table_name, entity_id, action, row_before, row_after)
    VALUES
      (auth.uid(), TG_TABLE_NAME, entity, 'INSERT', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSE
    entity := (to_jsonb(NEW) ->> 'id')::uuid;
    -- Skip UPDATEs that don't actually change persisted columns.
    IF to_jsonb(OLD) = to_jsonb(NEW) THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.workflow_audit_log
      (actor_id, table_name, entity_id, action, row_before, row_after)
    VALUES
      (auth.uid(), TG_TABLE_NAME, entity, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$;

DO $$
DECLARE
  tbl text;
  audited text[] := ARRAY[
    'rugs',
    'invoices',
    'estimates',
    'route_stops',
    'pickup_requests'
  ];
BEGIN
  FOREACH tbl IN ARRAY audited LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON public.%I',
      'trg_audit_' || tbl,
      tbl
    );
    EXECUTE format(
      'CREATE TRIGGER %I
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.record_workflow_audit()',
      'trg_audit_' || tbl,
      tbl
    );
  END LOOP;
END
$$;

COMMIT;
