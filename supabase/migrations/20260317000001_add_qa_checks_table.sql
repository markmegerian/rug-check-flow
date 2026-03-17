-- QA checks performed during production
CREATE TABLE IF NOT EXISTS public.qa_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rug_id uuid NOT NULL REFERENCES public.rugs(id) ON DELETE CASCADE,
  stage text NOT NULL, -- which production stage was checked
  passed boolean NOT NULL,
  notes text,
  checked_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qa_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal roles can manage qa_checks" ON public.qa_checks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'office', 'checkin_staff'))
  );

CREATE INDEX idx_qa_checks_rug_id ON public.qa_checks(rug_id);
