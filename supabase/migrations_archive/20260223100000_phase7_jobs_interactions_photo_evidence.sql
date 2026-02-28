-- Phase 7: intake jobs, interaction timeline, evidence photos, and estimate auto-draft flags

-- 1) Service-level estimate requirement control (option 2)
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS requires_estimate boolean NOT NULL DEFAULT true;

UPDATE public.services
SET requires_estimate = false
WHERE lower(name) IN (
  'cleaning',
  'dry cleaning',
  'overnight soaking',
  'moth wash removal',
  'deodorizing'
);

-- 2) Intake jobs model for consistent job-level tracking
CREATE TABLE IF NOT EXISTS public.intake_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_code text NOT NULL UNIQUE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('pickup', 'dropoff')),
  intake_date timestamptz NOT NULL,
  checkin_date timestamptz NOT NULL,
  pickup_scheduled_date date,
  pickup_request_id uuid REFERENCES public.pickup_requests(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_jobs_client_id ON public.intake_jobs(client_id);
CREATE INDEX IF NOT EXISTS idx_intake_jobs_pickup_request_id ON public.intake_jobs(pickup_request_id);
CREATE INDEX IF NOT EXISTS idx_intake_jobs_intake_date ON public.intake_jobs(intake_date DESC);

CREATE TRIGGER update_intake_jobs_updated_at
BEFORE UPDATE ON public.intake_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rugs
ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.intake_jobs(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS intake_source text CHECK (intake_source IN ('pickup', 'dropoff')),
ADD COLUMN IF NOT EXISTS intake_date timestamptz;

CREATE INDEX IF NOT EXISTS idx_rugs_job_id ON public.rugs(job_id);

-- 3) Interaction timeline object for office/client/rug/job context
CREATE TABLE IF NOT EXISTS public.interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.intake_jobs(id) ON DELETE SET NULL,
  rug_id uuid REFERENCES public.rugs(id) ON DELETE SET NULL,
  pickup_request_id uuid REFERENCES public.pickup_requests(id) ON DELETE SET NULL,
  interaction_type text NOT NULL,
  channel text NOT NULL DEFAULT 'phone',
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interactions_client_id_created_at ON public.interactions(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_job_id_created_at ON public.interactions(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_rug_id_created_at ON public.interactions(rug_id, created_at DESC);

-- 4) Photo evidence records (separate retention policies)
CREATE TABLE IF NOT EXISTS public.checkin_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.intake_jobs(id) ON DELETE SET NULL,
  rug_id uuid REFERENCES public.rugs(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  retention_policy text NOT NULL DEFAULT 'checkin_long_term',
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pickup_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_request_id uuid REFERENCES public.pickup_requests(id) ON DELETE CASCADE,
  pickup_item_id uuid REFERENCES public.pickup_request_items(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  retention_policy text NOT NULL DEFAULT 'pickup_short_term',
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkin_photos_rug_id ON public.checkin_photos(rug_id);
CREATE INDEX IF NOT EXISTS idx_pickup_photos_item_id ON public.pickup_photos(pickup_item_id);

-- 5) Storage buckets for evidence photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('checkin-photos', 'checkin-photos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('pickup-photos', 'pickup-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 6) RLS for new tables
ALTER TABLE public.intake_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkin_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickup_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_jobs_select_scoped"
ON public.intake_jobs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
  OR public.has_role(auth.uid(), 'driver'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = intake_jobs.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "intake_jobs_manage_internal"
ON public.intake_jobs
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
);

CREATE POLICY "interactions_select_scoped"
ON public.interactions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.portal_users pu
    WHERE pu.client_id = interactions.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "interactions_insert_internal"
ON public.interactions
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
  OR public.has_role(auth.uid(), 'driver'::public.app_role)
);

CREATE POLICY "checkin_photos_select_scoped"
ON public.checkin_photos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
  OR public.has_role(auth.uid(), 'driver'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.portal_users pu
    WHERE pu.client_id = checkin_photos.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "checkin_photos_manage_internal"
ON public.checkin_photos
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
);

CREATE POLICY "pickup_photos_select_scoped"
ON public.pickup_photos
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'driver'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.portal_users pu
    WHERE pu.client_id = pickup_photos.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "pickup_photos_insert_driver_internal"
ON public.pickup_photos
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'driver'::public.app_role)
);

CREATE POLICY "pickup_photos_delete_driver_internal"
ON public.pickup_photos
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'driver'::public.app_role)
);

-- 7) Storage object policies (bucket-scoped)
DROP POLICY IF EXISTS "checkin photos read" ON storage.objects;
CREATE POLICY "checkin photos read"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'checkin-photos');

DROP POLICY IF EXISTS "checkin photos write" ON storage.objects;
CREATE POLICY "checkin photos write"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'checkin-photos'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'office'::public.app_role)
    OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
  )
);

DROP POLICY IF EXISTS "pickup photos read" ON storage.objects;
CREATE POLICY "pickup photos read"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'pickup-photos');

DROP POLICY IF EXISTS "pickup photos write" ON storage.objects;
CREATE POLICY "pickup photos write"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'pickup-photos'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'office'::public.app_role)
    OR public.has_role(auth.uid(), 'driver'::public.app_role)
  )
);

-- 8) Driver pickup-item evidence attachment
ALTER TABLE public.pickup_request_items
ADD COLUMN IF NOT EXISTS driver_photo_urls text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.pickup_request_items
ADD COLUMN IF NOT EXISTS checked_in_rug_id uuid REFERENCES public.rugs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pickup_request_items_checked_in_rug_id
ON public.pickup_request_items(checked_in_rug_id);
