-- Allow office/admin users to read profile directory for role management and driver assignment
DROP POLICY IF EXISTS "Office and admin can view all profiles" ON public.profiles;

CREATE POLICY "Office and admin can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'office'::app_role)
);
