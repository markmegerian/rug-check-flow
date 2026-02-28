-- Mark M. can operate as superadmin regardless of table role state.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'markmegerian@gmail.com';
$$;

-- Allow superadmin to read profile and role tables even if role rows are temporarily missing.
DROP POLICY IF EXISTS "profiles_admin_office_select_all" ON public.profiles;
CREATE POLICY "profiles_admin_office_superadmin_select_all"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.is_super_admin()
);

DROP POLICY IF EXISTS "user_roles_admin_office_select_all" ON public.user_roles;
CREATE POLICY "user_roles_admin_office_superadmin_select_all"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.is_super_admin()
);

-- Regular admins can only manage non-admin rows; superadmin can manage all.
DROP POLICY IF EXISTS "user_roles_admin_manage_all" ON public.user_roles;
CREATE POLICY "user_roles_admin_manage_scoped"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.is_super_admin()
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND role <> 'admin'::public.app_role
  )
)
WITH CHECK (
  public.is_super_admin()
  OR (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND role <> 'admin'::public.app_role
  )
);
