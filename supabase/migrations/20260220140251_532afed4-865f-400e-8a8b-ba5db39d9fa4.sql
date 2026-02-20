
-- Fix permissive audit_log insert policy
DROP POLICY "Authenticated can insert audit entries" ON public.audit_log;

CREATE POLICY "Authenticated can insert own audit entries"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
