-- Tighten pickup request RLS to least-privilege model

-- pickup_requests SELECT
DROP POLICY IF EXISTS "Authenticated users can view pickup_requests" ON public.pickup_requests;
CREATE POLICY "Portal users can view own client pickup_requests"
ON public.pickup_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.portal_users pu
    WHERE pu.client_id = pickup_requests.client_id
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
      AND pu.status = 'active'
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR assigned_driver_id = auth.uid()
);

-- pickup_requests INSERT
DROP POLICY IF EXISTS "Authenticated users can insert pickup_requests" ON public.pickup_requests;
CREATE POLICY "Portal users and office/admin can insert pickup_requests"
ON public.pickup_requests FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.portal_users pu
    WHERE pu.client_id = pickup_requests.client_id
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
      AND pu.status = 'active'
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
);

-- pickup_requests DELETE
DROP POLICY IF EXISTS "Authenticated users can delete pickup_requests" ON public.pickup_requests;
CREATE POLICY "Portal users can delete own pending pickup_requests; office/admin can delete all"
ON public.pickup_requests FOR DELETE
USING (
  (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.client_id = pickup_requests.client_id
        AND lower(pu.email) = lower(auth.jwt() ->> 'email')
        AND pu.status = 'active'
    )
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
);

-- pickup_request_items SELECT
DROP POLICY IF EXISTS "Authenticated users can view pickup_request_items" ON public.pickup_request_items;
CREATE POLICY "Scoped users can view pickup_request_items"
ON public.pickup_request_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.pickup_requests pr
    JOIN public.portal_users pu ON pu.client_id = pr.client_id
    WHERE pr.id = pickup_request_items.pickup_request_id
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
      AND pu.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.pickup_requests pr
    WHERE pr.id = pickup_request_items.pickup_request_id
      AND pr.assigned_driver_id = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
);

-- pickup_request_items INSERT
DROP POLICY IF EXISTS "Authenticated users can insert pickup_request_items" ON public.pickup_request_items;
CREATE POLICY "Scoped users can insert pickup_request_items"
ON public.pickup_request_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pickup_requests pr
    JOIN public.portal_users pu ON pu.client_id = pr.client_id
    WHERE pr.id = pickup_request_items.pickup_request_id
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
      AND pu.status = 'active'
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
);

-- pickup_request_items DELETE
DROP POLICY IF EXISTS "Authenticated users can delete pickup_request_items" ON public.pickup_request_items;
CREATE POLICY "Scoped users can delete pickup_request_items"
ON public.pickup_request_items FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.pickup_requests pr
    JOIN public.portal_users pu ON pu.client_id = pr.client_id
    WHERE pr.id = pickup_request_items.pickup_request_id
      AND pr.status = 'pending'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
      AND pu.status = 'active'
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
);
