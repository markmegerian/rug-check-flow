
-- Delivery list status enum
CREATE TYPE public.delivery_list_status AS ENUM ('compiling', 'confirmed', 'checked_out');

-- Delivery lists - one per route day per week
CREATE TABLE public.delivery_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  route_day text NOT NULL,
  target_date date NOT NULL,
  status delivery_list_status NOT NULL DEFAULT 'compiling',
  compiled_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  checked_out_at timestamptz,
  checked_out_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(route_day, target_date)
);

-- Delivery list items - individual rugs on a delivery list
CREATE TABLE public.delivery_list_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_list_id uuid NOT NULL REFERENCES public.delivery_lists(id) ON DELETE CASCADE,
  rug_id uuid NOT NULL REFERENCES public.rugs(id),
  client_id uuid REFERENCES public.clients(id),
  confirmed_for_delivery boolean NOT NULL DEFAULT false,
  loaded_on_truck boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.delivery_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_list_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for delivery_lists
CREATE POLICY "Authenticated users can view delivery_lists"
ON public.delivery_lists FOR SELECT USING (true);

CREATE POLICY "Office and admin can manage delivery_lists"
ON public.delivery_lists FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role));

-- RLS policies for delivery_list_items
CREATE POLICY "Authenticated users can view delivery_list_items"
ON public.delivery_list_items FOR SELECT USING (true);

CREATE POLICY "Office and admin can manage delivery_list_items"
ON public.delivery_list_items FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role));

-- Driver can update loaded_on_truck
CREATE POLICY "Drivers can update delivery_list_items"
ON public.delivery_list_items FOR UPDATE
USING (has_role(auth.uid(), 'driver'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_delivery_lists_updated_at
BEFORE UPDATE ON public.delivery_lists
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
