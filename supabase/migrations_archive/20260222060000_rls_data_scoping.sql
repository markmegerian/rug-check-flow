-- Tighten broad read policies to tenant-aware access for portal users.

-- CLIENTS
DROP POLICY IF EXISTS "Authenticated users can view clients" ON public.clients;
CREATE POLICY "Internal roles or linked portal users can view clients"
ON public.clients
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'office'::app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::app_role)
  OR public.has_role(auth.uid(), 'driver'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = clients.id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

-- RUGS
DROP POLICY IF EXISTS "Authenticated users can view rugs" ON public.rugs;
CREATE POLICY "Internal roles or linked portal users can view rugs"
ON public.rugs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'office'::app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::app_role)
  OR public.has_role(auth.uid(), 'driver'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = rugs.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

-- INVOICES
DROP POLICY IF EXISTS "Authenticated users can view invoices" ON public.invoices;
CREATE POLICY "Office/admin or linked portal users can view invoices"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = invoices.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

-- INVOICE ITEMS
DROP POLICY IF EXISTS "Authenticated users can view invoice items" ON public.invoice_items;
CREATE POLICY "Office/admin or linked portal users can view invoice_items"
ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.portal_users pu ON pu.client_id = i.client_id
    WHERE i.id = invoice_items.invoice_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

-- PORTAL USERS
DROP POLICY IF EXISTS "Authenticated users can view portal users" ON public.portal_users;
CREATE POLICY "Office/admin can view all portal users; users can view own link"
ON public.portal_users
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'office'::app_role)
  OR lower(portal_users.email) = lower(auth.jwt() ->> 'email')
);
