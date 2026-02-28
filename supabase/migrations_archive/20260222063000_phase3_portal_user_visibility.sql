-- Phase 3 completion: restrict portal_users visibility

DROP POLICY IF EXISTS "Authenticated users can view portal users" ON public.portal_users;

CREATE POLICY "Office/admin and matching portal user can view portal_users"
ON public.portal_users
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE au.id = auth.uid()
      AND lower(au.email) = lower(portal_users.email)
  )
);
