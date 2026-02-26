-- Phase 3: invoice visibility in portal with least-privilege RLS

DROP POLICY IF EXISTS "Authenticated users can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated users can view invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Authenticated users can view payment_attempts" ON public.payment_attempts;

CREATE POLICY "Office, admin, and linked portal users can view invoices"
ON public.invoices
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    JOIN auth.users au ON au.email = pu.email
    WHERE pu.status = 'active'
      AND pu.client_id = invoices.client_id
      AND au.id = auth.uid()
  )
);

CREATE POLICY "Office, admin, and linked portal users can view invoice items"
ON public.invoice_items
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.portal_users pu ON pu.client_id = i.client_id
    JOIN auth.users au ON au.email = pu.email
    WHERE i.id = invoice_items.invoice_id
      AND pu.status = 'active'
      AND au.id = auth.uid()
  )
);

CREATE POLICY "Office, admin, and linked portal users can view payment attempts"
ON public.payment_attempts
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    JOIN auth.users au ON au.email = pu.email
    WHERE pu.status = 'active'
      AND pu.client_id = payment_attempts.client_id
      AND au.id = auth.uid()
  )
);
