-- Add estimate request fields to pickup_request_items (used by wholesale portal).
-- Safe to run: IF NOT EXISTS so already-applied or baseline-included schemas are fine.
ALTER TABLE public.pickup_request_items
  ADD COLUMN IF NOT EXISTS estimate_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimate_request_details text;

CREATE INDEX IF NOT EXISTS idx_pickup_request_items_estimate_requested
  ON public.pickup_request_items(estimate_requested)
  WHERE estimate_requested = true;
