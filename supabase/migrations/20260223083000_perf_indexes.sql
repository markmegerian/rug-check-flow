-- Add missing performance indexes for workflow queries.
-- These are additive and safe to run repeatedly.

-- Portal users
CREATE INDEX IF NOT EXISTS idx_portal_users_client_id
ON public.portal_users(client_id);

-- Support case-insensitive portal lookups + RLS checks using lower(email).
CREATE INDEX IF NOT EXISTS idx_portal_users_lower_email
ON public.portal_users (lower(email));

-- Rugs
CREATE INDEX IF NOT EXISTS idx_rugs_client_id
ON public.rugs(client_id);

CREATE INDEX IF NOT EXISTS idx_rugs_status
ON public.rugs(status);

CREATE INDEX IF NOT EXISTS idx_rugs_client_status
ON public.rugs(client_id, status);

-- Invoices
CREATE INDEX IF NOT EXISTS idx_invoices_client_id
ON public.invoices(client_id);

CREATE INDEX IF NOT EXISTS idx_invoices_status
ON public.invoices(status);

CREATE INDEX IF NOT EXISTS idx_invoices_client_status
ON public.invoices(client_id, status);

-- Invoice items
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id
ON public.invoice_items(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_items_rug_id
ON public.invoice_items(rug_id)
WHERE rug_id IS NOT NULL;

-- Estimates
CREATE INDEX IF NOT EXISTS idx_estimates_client_id
ON public.estimates(client_id);

CREATE INDEX IF NOT EXISTS idx_estimates_rug_id
ON public.estimates(rug_id);

CREATE INDEX IF NOT EXISTS idx_estimates_status
ON public.estimates(status);

CREATE INDEX IF NOT EXISTS idx_estimates_client_status
ON public.estimates(client_id, status);

-- Estimate items
CREATE INDEX IF NOT EXISTS idx_estimate_items_estimate_id
ON public.estimate_items(estimate_id);

CREATE INDEX IF NOT EXISTS idx_estimate_items_rug_service_id
ON public.estimate_items(rug_service_id)
WHERE rug_service_id IS NOT NULL;

-- Communication events
CREATE INDEX IF NOT EXISTS idx_communication_events_rug_id
ON public.communication_events(rug_id)
WHERE rug_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_communication_events_estimate_id
ON public.communication_events(estimate_id)
WHERE estimate_id IS NOT NULL;

-- Pickup workflow
CREATE INDEX IF NOT EXISTS idx_pickup_request_items_rug_id
ON public.pickup_request_items(rug_id)
WHERE rug_id IS NOT NULL;

-- Common filter pattern in office and portal views.
CREATE INDEX IF NOT EXISTS idx_pickup_requests_client_status_date
ON public.pickup_requests(client_id, status, scheduled_date);

