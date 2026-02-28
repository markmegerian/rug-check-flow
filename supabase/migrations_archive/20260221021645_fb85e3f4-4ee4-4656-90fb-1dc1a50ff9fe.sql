ALTER TABLE public.rug_services ADD COLUMN edges text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.rug_services.edges IS 'Selected rug edges for per-linear-ft services, e.g. {end1,side2}';
