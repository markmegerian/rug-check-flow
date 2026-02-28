-- Phase 4B: allow linked portal users to log inbound communication events
DROP POLICY IF EXISTS "Linked portal users can log inbound communication events" ON public.communication_events;

CREATE POLICY "Linked portal users can log inbound communication events"
ON public.communication_events
FOR INSERT
WITH CHECK (
  direction = 'inbound'::public.communication_direction
  AND EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.status = 'active'
      AND pu.client_id = communication_events.client_id
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);
