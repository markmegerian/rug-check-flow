-- Add completed_at and completed_by columns to rug_services
ALTER TABLE public.rug_services ADD COLUMN IF NOT EXISTS completed_at timestamptz DEFAULT NULL;
ALTER TABLE public.rug_services ADD COLUMN IF NOT EXISTS completed_by uuid DEFAULT NULL;

-- Fix rug_services RLS: change policies from public to authenticated
-- First drop existing policies that target public role
DROP POLICY IF EXISTS "Authenticated users can view rug_services" ON public.rug_services;
DROP POLICY IF EXISTS "Staff can insert rug_services" ON public.rug_services;
DROP POLICY IF EXISTS "Staff can update rug_services" ON public.rug_services;
DROP POLICY IF EXISTS "Staff can delete rug_services" ON public.rug_services;

-- Recreate with authenticated role
CREATE POLICY "Authenticated users can view rug_services"
ON public.rug_services FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Staff can insert rug_services"
ON public.rug_services FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR has_role(auth.uid(), 'checkin_staff'::app_role)
);

CREATE POLICY "Staff can update rug_services"
ON public.rug_services FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR has_role(auth.uid(), 'checkin_staff'::app_role)
);

CREATE POLICY "Staff can delete rug_services"
ON public.rug_services FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'office'::app_role)
  OR has_role(auth.uid(), 'checkin_staff'::app_role)
);