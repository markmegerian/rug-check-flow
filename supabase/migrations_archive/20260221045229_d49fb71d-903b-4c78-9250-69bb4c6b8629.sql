ALTER TABLE public.services ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

-- Initialize sort_order based on current alphabetical order within each category
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY category ORDER BY name) AS rn
  FROM public.services
)
UPDATE public.services SET sort_order = ranked.rn FROM ranked WHERE public.services.id = ranked.id;