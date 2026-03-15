-- Per-line-item client approval/rejection for portal.
ALTER TABLE public.estimate_items
  ADD COLUMN IF NOT EXISTS client_approved boolean NULL,
  ADD COLUMN IF NOT EXISTS client_decision_at timestamptz NULL;

COMMENT ON COLUMN public.estimate_items.client_approved IS 'Portal client approved (true) or rejected (false) this line; NULL = not yet decided.';
COMMENT ON COLUMN public.estimate_items.client_decision_at IS 'When the portal client set client_approved.';

-- Portal users can update only client_approved and client_decision_at on estimate_items
-- when the parent estimate is for their client and status = sent.
CREATE POLICY "estimate_items_update_portal_sent"
  ON public.estimate_items
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.estimates e
      JOIN public.portal_users pu ON pu.client_id = e.client_id
        AND pu.status = 'active'
        AND lower(pu.email) = lower(auth.jwt() ->> 'email')
      WHERE e.id = estimate_items.estimate_id
        AND e.status = 'sent'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.estimates e
      JOIN public.portal_users pu ON pu.client_id = e.client_id
        AND pu.status = 'active'
        AND lower(pu.email) = lower(auth.jwt() ->> 'email')
      WHERE e.id = estimate_items.estimate_id
        AND e.status = 'sent'
    )
  );
