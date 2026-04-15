ALTER TABLE public.rug_services
ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
CHECK (approval_status IN ('pending', 'approved', 'rejected'));

COMMENT ON COLUMN public.rug_services.approval_status IS 'Client/service approval state for this rug service line: pending, approved, or rejected.';
