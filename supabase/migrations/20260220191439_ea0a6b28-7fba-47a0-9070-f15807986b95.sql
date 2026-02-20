
-- Create rug_services junction table
CREATE TABLE public.rug_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rug_id UUID NOT NULL REFERENCES public.rugs(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id),
  unit_price NUMERIC NOT NULL,
  line_total NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rug_services ENABLE ROW LEVEL SECURITY;

-- Authenticated can view
CREATE POLICY "Authenticated users can view rug_services"
ON public.rug_services FOR SELECT
USING (true);

-- Staff/office/admin can insert
CREATE POLICY "Staff can insert rug_services"
ON public.rug_services FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR has_role(auth.uid(), 'checkin_staff'::app_role)
);

-- Staff/office/admin can update
CREATE POLICY "Staff can update rug_services"
ON public.rug_services FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR has_role(auth.uid(), 'checkin_staff'::app_role)
);

-- Index for fast lookups
CREATE INDEX idx_rug_services_rug_id ON public.rug_services(rug_id);
CREATE INDEX idx_rug_services_service_id ON public.rug_services(service_id);
