-- Phase 2 completion: estimate visibility/actions for portal users and tighter RLS

DROP POLICY IF EXISTS "Authenticated users can view estimates" ON public.estimates;
DROP POLICY IF EXISTS "Authenticated users can view estimate_items" ON public.estimate_items;
DROP POLICY IF EXISTS "Authenticated users can view communication_events" ON public.communication_events;

CREATE POLICY "Office, admin, and linked portal users can view estimates"
ON public.estimates
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    JOIN auth.users au ON au.email = pu.email
    WHERE pu.status = 'active'
      AND pu.client_id = estimates.client_id
      AND au.id = auth.uid()
  )
);

CREATE POLICY "Linked portal users can approve or reject own estimates"
ON public.estimates
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.portal_users pu
    JOIN auth.users au ON au.email = pu.email
    WHERE pu.status = 'active'
      AND pu.client_id = estimates.client_id
      AND au.id = auth.uid()
  )
  AND status = 'sent'
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.portal_users pu
    JOIN auth.users au ON au.email = pu.email
    WHERE pu.status = 'active'
      AND pu.client_id = estimates.client_id
      AND au.id = auth.uid()
  )
  AND status IN ('approved', 'rejected')
  AND rug_id = (SELECT e.rug_id FROM public.estimates e WHERE e.id = estimates.id)
  AND client_id IS NOT DISTINCT FROM (SELECT e.client_id FROM public.estimates e WHERE e.id = estimates.id)
  AND estimate_number = (SELECT e.estimate_number FROM public.estimates e WHERE e.id = estimates.id)
  AND version = (SELECT e.version FROM public.estimates e WHERE e.id = estimates.id)
  AND total = (SELECT e.total FROM public.estimates e WHERE e.id = estimates.id)
  AND sent_at IS NOT DISTINCT FROM (SELECT e.sent_at FROM public.estimates e WHERE e.id = estimates.id)
  AND expires_at IS NOT DISTINCT FROM (SELECT e.expires_at FROM public.estimates e WHERE e.id = estimates.id)
  AND created_by IS NOT DISTINCT FROM (SELECT e.created_by FROM public.estimates e WHERE e.id = estimates.id)
  AND created_at = (SELECT e.created_at FROM public.estimates e WHERE e.id = estimates.id)
);

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
    JOIN auth.users au ON au.email = pu.email
    WHERE e.id = estimate_items.estimate_id
      AND pu.status = 'active'
      AND au.id = auth.uid()
  )
);

CREATE POLICY "Office, admin, and linked portal users can view own communication events"
ON public.communication_events
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    JOIN auth.users au ON au.email = pu.email
    WHERE pu.status = 'active'
      AND pu.client_id = communication_events.client_id
      AND au.id = auth.uid()
  )
);
