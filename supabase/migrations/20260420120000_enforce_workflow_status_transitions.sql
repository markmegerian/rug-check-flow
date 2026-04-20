-- Enforce workflow state-machine transitions at the database level.
--
-- The React client already carries advisory transition tables in
-- src/lib/workflow-guards.ts, but they run only in-browser and can be bypassed
-- by any caller that talks to PostgREST directly (including offline drivers who
-- replay stale state). This migration mirrors those tables as
-- BEFORE UPDATE triggers so illegal transitions are rejected server-side for
-- pickup_requests, estimates, and route_stops.
--
-- Approach: rather than a CHECK constraint (which can't inspect OLD rows) we
-- register per-table trigger functions that compare OLD.status -> NEW.status
-- against an allow-list. When NEW.status = OLD.status the trigger is a no-op,
-- so unrelated column updates are unaffected.

BEGIN;

-- ---------------------------------------------------------------------------
-- pickup_requests
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_pickup_request_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  allowed := CASE OLD.status
    WHEN 'pending'   THEN NEW.status IN ('confirmed', 'assigned', 'cancelled')
    WHEN 'confirmed' THEN NEW.status IN ('assigned', 'cancelled')
    WHEN 'assigned'  THEN NEW.status IN ('completed', 'cancelled')
    WHEN 'completed' THEN FALSE
    WHEN 'cancelled' THEN FALSE
    ELSE FALSE
  END;

  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid transition: pickup_requests.status % -> %',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pickup_requests_status_transition
  ON public.pickup_requests;
CREATE TRIGGER pickup_requests_status_transition
  BEFORE UPDATE OF status ON public.pickup_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_pickup_request_status_transition();

-- ---------------------------------------------------------------------------
-- estimates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_estimate_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  allowed := CASE OLD.status
    WHEN 'draft'    THEN NEW.status IN ('sent', 'expired')
    WHEN 'sent'     THEN NEW.status IN ('approved', 'rejected', 'expired')
    WHEN 'approved' THEN FALSE
    WHEN 'rejected' THEN FALSE
    WHEN 'expired'  THEN FALSE
    ELSE FALSE
  END;

  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid transition: estimates.status % -> %',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimates_status_transition ON public.estimates;
CREATE TRIGGER estimates_status_transition
  BEFORE UPDATE OF status ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_estimate_status_transition();

-- ---------------------------------------------------------------------------
-- route_stops
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_route_stop_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  allowed := CASE OLD.status
    WHEN 'queued'                    THEN NEW.status IN ('in_progress', 'unable_to_complete')
    WHEN 'in_progress'               THEN NEW.status IN ('completed', 'completed_with_exceptions', 'unable_to_complete')
    WHEN 'completed'                 THEN FALSE
    WHEN 'completed_with_exceptions' THEN FALSE
    WHEN 'unable_to_complete'        THEN NEW.status IN ('queued', 'in_progress')
    ELSE FALSE
  END;

  IF NOT allowed THEN
    RAISE EXCEPTION 'invalid transition: route_stops.status % -> %',
      OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS route_stops_status_transition ON public.route_stops;
CREATE TRIGGER route_stops_status_transition
  BEFORE UPDATE OF status ON public.route_stops
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_route_stop_status_transition();

COMMIT;
