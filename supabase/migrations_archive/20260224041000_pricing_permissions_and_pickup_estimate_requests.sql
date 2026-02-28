-- Restrict service price changes to admins only.
DROP POLICY IF EXISTS "services_manage_admin_office" ON public.services;

CREATE POLICY "services_manage_admin_only"
ON public.services
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Allow active portal users to read service pricing for their account reference.
CREATE POLICY "services_select_portal_active"
ON public.services
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE lower(pu.email) = lower(auth.email())
      AND pu.status = 'active'
  )
);

-- Allow wholesale users to request estimate notes per pickup rug item.
ALTER TABLE public.pickup_request_items
ADD COLUMN IF NOT EXISTS estimate_requested boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS estimate_request_details text;

CREATE INDEX IF NOT EXISTS idx_pickup_request_items_estimate_requested
ON public.pickup_request_items(estimate_requested)
WHERE estimate_requested = true;
