-- Track individual service completions on rugs
ALTER TABLE public.rug_services ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.rug_services ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id);
