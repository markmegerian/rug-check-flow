
ALTER TABLE public.rug_services ADD COLUMN service_name text NOT NULL DEFAULT '';

-- Backfill existing rows
UPDATE public.rug_services rs
SET service_name = s.name
FROM public.services s
WHERE rs.service_id = s.id;
