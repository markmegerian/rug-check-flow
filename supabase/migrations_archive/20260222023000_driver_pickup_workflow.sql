-- Driver workflow support for pickup requests

ALTER TABLE public.pickup_requests
ADD COLUMN assigned_driver_id uuid REFERENCES auth.users(id),
ADD COLUMN assigned_at timestamptz,
ADD COLUMN completed_at timestamptz,
ADD COLUMN signature_data_url text;

ALTER TABLE public.pickup_request_items
ADD COLUMN verified boolean NOT NULL DEFAULT false,
ADD COLUMN driver_notes text NOT NULL DEFAULT '';

CREATE INDEX idx_pickup_requests_assigned_driver_id ON public.pickup_requests(assigned_driver_id);
CREATE INDEX idx_pickup_requests_status ON public.pickup_requests(status);

-- Drivers can only update pickup requests assigned to them
DROP POLICY IF EXISTS "Authenticated users can update pickup_requests" ON public.pickup_requests;
CREATE POLICY "Office/admin and assigned drivers can update pickup_requests"
ON public.pickup_requests FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR assigned_driver_id = auth.uid()
  OR (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.client_id = pickup_requests.client_id
        AND lower(pu.email) = lower(auth.jwt() ->> 'email')
        AND pu.status = 'active'
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR assigned_driver_id = auth.uid()
  OR (
    status = 'pending'
    AND assigned_driver_id IS NULL
    AND assigned_at IS NULL
    AND completed_at IS NULL
    AND signature_data_url IS NULL
    AND EXISTS (
      SELECT 1 FROM public.portal_users pu
      WHERE pu.client_id = pickup_requests.client_id
        AND lower(pu.email) = lower(auth.jwt() ->> 'email')
        AND pu.status = 'active'
    )
  )
);

-- Drivers can only update items for pickup requests assigned to them
DROP POLICY IF EXISTS "Authenticated users can update pickup_request_items" ON public.pickup_request_items;
CREATE POLICY "Office/admin and assigned drivers can update pickup_request_items"
ON public.pickup_request_items FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.pickup_requests pr
    WHERE pr.id = pickup_request_id
      AND pr.assigned_driver_id = auth.uid()
  )
);
