-- Portal pickup request workflow (DB-backed)

CREATE TYPE public.pickup_request_status AS ENUM ('pending', 'confirmed', 'assigned', 'completed', 'cancelled');

CREATE TABLE public.pickup_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  route_day text NOT NULL DEFAULT '',
  scheduled_date date NOT NULL,
  status pickup_request_status NOT NULL DEFAULT 'pending',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.pickup_request_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pickup_request_id uuid NOT NULL REFERENCES public.pickup_requests(id) ON DELETE CASCADE,
  rug_id uuid REFERENCES public.rugs(id) ON DELETE SET NULL,
  rug_number text NOT NULL,
  rug_type text NOT NULL DEFAULT '',
  length numeric,
  width numeric,
  is_new boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pickup_requests_client_id ON public.pickup_requests(client_id);
CREATE INDEX idx_pickup_requests_scheduled_date ON public.pickup_requests(scheduled_date);
CREATE INDEX idx_pickup_request_items_pickup_request_id ON public.pickup_request_items(pickup_request_id);

ALTER TABLE public.pickup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_request_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pickup_requests"
ON public.pickup_requests FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert pickup_requests"
ON public.pickup_requests FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update pickup_requests"
ON public.pickup_requests FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can delete pickup_requests"
ON public.pickup_requests FOR DELETE
USING (true);

CREATE POLICY "Authenticated users can view pickup_request_items"
ON public.pickup_request_items FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert pickup_request_items"
ON public.pickup_request_items FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update pickup_request_items"
ON public.pickup_request_items FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can delete pickup_request_items"
ON public.pickup_request_items FOR DELETE
USING (true);

CREATE TRIGGER update_pickup_requests_updated_at
BEFORE UPDATE ON public.pickup_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
