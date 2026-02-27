-- Ensure wholesale portal users must reset password on first/temporary login.
ALTER TABLE public.portal_users
ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.portal_users.must_change_password IS
  'When true, portal user must set a non-temporary password before accessing workflow tabs.';

-- Backfill existing rows: completed onboarding users are assumed to have already changed password.
UPDATE public.portal_users
SET must_change_password = CASE
  WHEN onboarding_completed_at IS NULL THEN true
  ELSE false
END;

CREATE OR REPLACE FUNCTION public.mark_portal_password_changed()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer := 0;
BEGIN
  UPDATE public.portal_users
  SET must_change_password = false
  WHERE status = 'active'
    AND lower(email) = lower(auth.jwt() ->> 'email');

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_portal_password_changed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_portal_password_changed() TO authenticated;
