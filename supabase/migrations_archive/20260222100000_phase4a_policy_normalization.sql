-- Phase 4A: normalize portal-linked RLS identity checks to JWT email matching

-- Estimates and estimate_items
DROP POLICY IF EXISTS "Office, admin, and linked portal users can view estimates" ON public.estimates;
CREATE POLICY "Office, admin, and linked portal users can view estimates"
ON public.estimates
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.status = 'active'
      AND pu.client_id = estimates.client_id
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "Linked portal users can approve or reject own estimates" ON public.estimates;
CREATE POLICY "Linked portal users can approve or reject own estimates"
ON public.estimates
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.status = 'active'
      AND pu.client_id = estimates.client_id
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.status = 'active'
      AND pu.client_id = estimates.client_id
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
  AND status IN ('approved', 'rejected')
);

DROP POLICY IF EXISTS "Office, admin, and linked portal users can view estimate items" ON public.estimate_items;
CREATE POLICY "Office, admin, and linked portal users can view estimate items"
ON public.estimate_items
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.estimates e
    JOIN public.portal_users pu ON pu.client_id = e.client_id
    WHERE e.id = estimate_items.estimate_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "Office, admin, and linked portal users can view own communication events" ON public.communication_events;
CREATE POLICY "Office, admin, and linked portal users can view own communication events"
ON public.communication_events
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.status = 'active'
      AND pu.client_id = communication_events.client_id
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

-- Invoices and payment_attempts
DROP POLICY IF EXISTS "Office, admin, and linked portal users can view invoices" ON public.invoices;
CREATE POLICY "Office, admin, and linked portal users can view invoices"
ON public.invoices
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.status = 'active'
      AND pu.client_id = invoices.client_id
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "Office, admin, and linked portal users can view invoice items" ON public.invoice_items;
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
    WHERE i.id = invoice_items.invoice_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

DROP POLICY IF EXISTS "Office, admin, and linked portal users can view payment attempts" ON public.payment_attempts;
CREATE POLICY "Office, admin, and linked portal users can view payment attempts"
ON public.payment_attempts
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.status = 'active'
      AND pu.client_id = payment_attempts.client_id
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

-- portal_users visibility
DROP POLICY IF EXISTS "Office/admin and matching portal user can view portal_users" ON public.portal_users;
CREATE POLICY "Office/admin and matching portal user can view portal_users"
ON public.portal_users
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR lower(portal_users.email) = lower(auth.jwt() ->> 'email')
);
