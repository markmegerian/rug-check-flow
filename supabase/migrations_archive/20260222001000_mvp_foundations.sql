-- Robust lifecycle foundations for MVP

-- 1) Explicit invoice linkage back to delivery list checkout
ALTER TABLE public.invoices
ADD COLUMN delivery_list_id uuid REFERENCES public.delivery_lists(id) ON DELETE SET NULL;

CREATE INDEX idx_invoices_delivery_list_id ON public.invoices(delivery_list_id);

-- 2) Estimate lifecycle with immutable version records
CREATE TYPE public.estimate_status AS ENUM ('draft', 'sent', 'approved', 'rejected', 'expired');

CREATE TABLE public.estimates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rug_id uuid NOT NULL REFERENCES public.rugs(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  estimate_number text NOT NULL UNIQUE,
  status estimate_status NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  total numeric NOT NULL DEFAULT 0,
  sent_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.estimate_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  rug_service_id uuid REFERENCES public.rug_services(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estimate_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view estimates"
ON public.estimates FOR SELECT
USING (true);

CREATE POLICY "Office and admin can manage estimates"
ON public.estimates FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role));

CREATE POLICY "Authenticated users can view estimate_items"
ON public.estimate_items FOR SELECT
USING (true);

CREATE POLICY "Office and admin can manage estimate_items"
ON public.estimate_items FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role));

CREATE TRIGGER update_estimates_updated_at
BEFORE UPDATE ON public.estimates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Billing profiles for autopay and A/R behavior per client
CREATE TYPE public.billing_strategy AS ENUM ('autopay_card', 'manual_invoice');

CREATE TABLE public.client_billing_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  strategy billing_strategy NOT NULL DEFAULT 'manual_invoice',
  autopay_enabled boolean NOT NULL DEFAULT false,
  payment_provider text NOT NULL DEFAULT 'stripe',
  customer_ref text,
  default_payment_method_ref text,
  aggressive_collections boolean NOT NULL DEFAULT false,
  terms_days integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_billing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view client_billing_profiles"
ON public.client_billing_profiles FOR SELECT
USING (true);

CREATE POLICY "Office and admin can manage client_billing_profiles"
ON public.client_billing_profiles FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role));

CREATE TRIGGER update_client_billing_profiles_updated_at
BEFORE UPDATE ON public.client_billing_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Payment attempt ledger and communication timeline
CREATE TYPE public.payment_attempt_status AS ENUM ('pending', 'succeeded', 'failed');

CREATE TABLE public.payment_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  provider text NOT NULL DEFAULT 'stripe',
  provider_payment_ref text,
  amount numeric NOT NULL DEFAULT 0,
  status payment_attempt_status NOT NULL DEFAULT 'pending',
  attempted_at timestamptz NOT NULL DEFAULT now(),
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_payment_attempts_invoice_id ON public.payment_attempts(invoice_id);
CREATE INDEX idx_payment_attempts_client_id ON public.payment_attempts(client_id);

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view payment_attempts"
ON public.payment_attempts FOR SELECT
USING (true);

CREATE POLICY "Office and admin can manage payment_attempts"
ON public.payment_attempts FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role));

CREATE TYPE public.communication_channel AS ENUM ('email', 'in_app_chat');
CREATE TYPE public.communication_direction AS ENUM ('outbound', 'inbound');

CREATE TABLE public.communication_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  rug_id uuid REFERENCES public.rugs(id) ON DELETE SET NULL,
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  channel communication_channel NOT NULL DEFAULT 'email',
  direction communication_direction NOT NULL DEFAULT 'outbound',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  sent_to text,
  event_type text NOT NULL DEFAULT 'general',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_communication_events_client_id ON public.communication_events(client_id);
CREATE INDEX idx_communication_events_invoice_id ON public.communication_events(invoice_id);

ALTER TABLE public.communication_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view communication_events"
ON public.communication_events FOR SELECT
USING (true);

CREATE POLICY "Office and admin can manage communication_events"
ON public.communication_events FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'office'::app_role));
