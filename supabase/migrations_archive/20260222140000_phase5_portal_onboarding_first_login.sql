-- Phase 5: wholesale portal first-login onboarding state
ALTER TABLE public.portal_users
ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

COMMENT ON COLUMN public.portal_users.onboarding_completed_at IS
  'Timestamp set when a portal user completes first-login onboarding.';

CREATE OR REPLACE FUNCTION public.mark_portal_onboarding_complete()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer := 0;
BEGIN
  UPDATE public.portal_users
  SET onboarding_completed_at = COALESCE(onboarding_completed_at, now())
  WHERE status = 'active'
    AND lower(email) = lower(auth.jwt() ->> 'email');

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_portal_onboarding_complete() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_portal_onboarding_complete() TO authenticated;
