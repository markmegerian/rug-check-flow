-- Store service category on estimate_items so portal can treat Cleaning as always approved (not rejectable).
ALTER TABLE public.estimate_items
  ADD COLUMN IF NOT EXISTS service_category text DEFAULT '' NOT NULL;

COMMENT ON COLUMN public.estimate_items.service_category IS 'Service category (e.g. Cleaning, Repair). Cleaning items are always approved and not rejectable by client.';
