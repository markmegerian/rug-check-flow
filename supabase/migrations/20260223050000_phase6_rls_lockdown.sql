-- Phase 6: replace emergency permissive RLS with scoped policies.
-- This migration assumes core RugBoost tables already exist.

DO $$
DECLARE
  target_table text;
  target_policy record;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'audit_log',
    'clients',
    'communication_events',
    'delivery_list_items',
    'delivery_lists',
    'estimate_items',
    'estimates',
    'invoice_items',
    'invoices',
    'payment_attempts',
    'pickup_request_items',
    'pickup_requests',
    'portal_users',
    'profiles',
    'rug_services',
    'rugs',
    'services',
    'user_roles'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    FOR target_policy IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', target_policy.policyname, target_table);
    END LOOP;
  END LOOP;
END
$$;

-- Profiles
CREATE POLICY "profiles_self_select"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "profiles_self_insert"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_self_update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_admin_office_select_all"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

-- User roles
CREATE POLICY "user_roles_self_select"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "user_roles_admin_office_select_all"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "user_roles_admin_manage_all"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Clients
CREATE POLICY "clients_select_scoped"
ON public.clients
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
    WHERE pu.client_id = clients.id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "clients_insert_internal"
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "clients_update_internal"
ON public.clients
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "clients_delete_internal"
ON public.clients
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

-- Portal users
CREATE POLICY "portal_users_select_scoped"
ON public.portal_users
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR lower(portal_users.email) = lower(auth.jwt() ->> 'email')
);

CREATE POLICY "portal_users_insert_internal"
ON public.portal_users
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "portal_users_update_internal"
ON public.portal_users
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "portal_users_delete_internal"
ON public.portal_users
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

-- Services
CREATE POLICY "services_select_internal"
ON public.services
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
);

CREATE POLICY "services_manage_admin_office"
ON public.services
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

-- Rugs
CREATE POLICY "rugs_select_scoped"
ON public.rugs
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
    WHERE pu.client_id = rugs.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "rugs_manage_internal"
ON public.rugs
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

-- Rug services
CREATE POLICY "rug_services_select_internal"
ON public.rug_services
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
);

CREATE POLICY "rug_services_manage_internal"
ON public.rug_services
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

-- Delivery lists and items
CREATE POLICY "delivery_lists_manage_admin_office"
ON public.delivery_lists
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "delivery_list_items_manage_admin_office"
ON public.delivery_list_items
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

-- Invoices
CREATE POLICY "invoices_select_scoped"
ON public.invoices
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = invoices.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "invoices_manage_admin_office"
ON public.invoices
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

-- Invoice items
CREATE POLICY "invoice_items_select_scoped"
ON public.invoice_items
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.invoices i
    JOIN public.portal_users pu ON pu.client_id = i.client_id
    WHERE i.id = invoice_items.invoice_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "invoice_items_manage_admin_office"
ON public.invoice_items
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

-- Payment attempts
CREATE POLICY "payment_attempts_select_scoped"
ON public.payment_attempts
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = payment_attempts.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "payment_attempts_manage_admin_office"
ON public.payment_attempts
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

-- Estimates
CREATE POLICY "estimates_select_scoped"
ON public.estimates
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = estimates.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "estimates_insert_admin_office"
ON public.estimates
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "estimates_update_admin_office"
ON public.estimates
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "estimates_update_portal_sent_transition"
ON public.estimates
FOR UPDATE
TO authenticated
USING (
  status = 'sent'::public.estimate_status
  AND EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = estimates.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  status IN ('approved'::public.estimate_status, 'rejected'::public.estimate_status)
  AND EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = estimates.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "estimates_delete_admin_office"
ON public.estimates
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

-- Estimate items
CREATE POLICY "estimate_items_select_scoped"
ON public.estimate_items
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.estimates e
    JOIN public.portal_users pu ON pu.client_id = e.client_id
    WHERE e.id = estimate_items.estimate_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "estimate_items_manage_admin_office"
ON public.estimate_items
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

-- Communication events
CREATE POLICY "communication_events_select_scoped"
ON public.communication_events
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR (
    communication_events.client_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.portal_users pu
      WHERE pu.client_id = communication_events.client_id
        AND pu.status = 'active'
        AND lower(pu.email) = lower(auth.jwt() ->> 'email')
    )
  )
);

CREATE POLICY "communication_events_insert_internal"
ON public.communication_events
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "communication_events_insert_portal"
ON public.communication_events
FOR INSERT
TO authenticated
WITH CHECK (
  communication_events.client_id IS NOT NULL
  AND communication_events.channel = 'in_app_chat'::public.communication_channel
  AND communication_events.direction = 'inbound'::public.communication_direction
  AND EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = communication_events.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "communication_events_update_admin_office"
ON public.communication_events
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "communication_events_delete_admin_office"
ON public.communication_events
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

-- Pickup requests
CREATE POLICY "pickup_requests_select_scoped"
ON public.pickup_requests
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
  OR pickup_requests.assigned_driver_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = pickup_requests.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "pickup_requests_insert_internal"
ON public.pickup_requests
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "pickup_requests_insert_portal"
ON public.pickup_requests
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = pickup_requests.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "pickup_requests_update_internal"
ON public.pickup_requests
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "pickup_requests_update_driver_assigned"
ON public.pickup_requests
FOR UPDATE
TO authenticated
USING (pickup_requests.assigned_driver_id = auth.uid())
WITH CHECK (pickup_requests.assigned_driver_id = auth.uid());

CREATE POLICY "pickup_requests_update_portal_pending"
ON public.pickup_requests
FOR UPDATE
TO authenticated
USING (
  pickup_requests.status = 'pending'::public.pickup_request_status
  AND EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = pickup_requests.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  pickup_requests.status = 'pending'::public.pickup_request_status
  AND EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = pickup_requests.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "pickup_requests_delete_internal"
ON public.pickup_requests
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "pickup_requests_delete_portal_pending"
ON public.pickup_requests
FOR DELETE
TO authenticated
USING (
  pickup_requests.status = 'pending'::public.pickup_request_status
  AND EXISTS (
    SELECT 1
    FROM public.portal_users pu
    WHERE pu.client_id = pickup_requests.client_id
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

-- Pickup request items
CREATE POLICY "pickup_request_items_select_scoped"
ON public.pickup_request_items
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
  OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.pickup_requests pr
    WHERE pr.id = pickup_request_items.pickup_request_id
      AND pr.assigned_driver_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.pickup_requests pr
    JOIN public.portal_users pu ON pu.client_id = pr.client_id
    WHERE pr.id = pickup_request_items.pickup_request_id
      AND pr.status = 'pending'::public.pickup_request_status
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "pickup_request_items_insert_internal"
ON public.pickup_request_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "pickup_request_items_insert_portal_pending"
ON public.pickup_request_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.pickup_requests pr
    JOIN public.portal_users pu ON pu.client_id = pr.client_id
    WHERE pr.id = pickup_request_items.pickup_request_id
      AND pr.status = 'pending'::public.pickup_request_status
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "pickup_request_items_update_internal"
ON public.pickup_request_items
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "pickup_request_items_update_driver_assigned"
ON public.pickup_request_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pickup_requests pr
    WHERE pr.id = pickup_request_items.pickup_request_id
      AND pr.assigned_driver_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.pickup_requests pr
    WHERE pr.id = pickup_request_items.pickup_request_id
      AND pr.assigned_driver_id = auth.uid()
  )
);

CREATE POLICY "pickup_request_items_update_portal_pending"
ON public.pickup_request_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pickup_requests pr
    JOIN public.portal_users pu ON pu.client_id = pr.client_id
    WHERE pr.id = pickup_request_items.pickup_request_id
      AND pr.status = 'pending'::public.pickup_request_status
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.pickup_requests pr
    JOIN public.portal_users pu ON pu.client_id = pr.client_id
    WHERE pr.id = pickup_request_items.pickup_request_id
      AND pr.status = 'pending'::public.pickup_request_status
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

CREATE POLICY "pickup_request_items_delete_internal"
ON public.pickup_request_items
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);

CREATE POLICY "pickup_request_items_delete_portal_pending"
ON public.pickup_request_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.pickup_requests pr
    JOIN public.portal_users pu ON pu.client_id = pr.client_id
    WHERE pr.id = pickup_request_items.pickup_request_id
      AND pr.status = 'pending'::public.pickup_request_status
      AND pu.status = 'active'
      AND lower(pu.email) = lower(auth.jwt() ->> 'email')
  )
);

-- Audit log
CREATE POLICY "audit_log_select_admin"
ON public.audit_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "audit_log_insert_admin_office"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'office'::public.app_role)
);
