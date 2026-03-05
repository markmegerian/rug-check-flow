-- PR-6 acceptance tests

-- 1) Portal users cannot message other clients
DO $$
DECLARE
  v_client_a uuid;
  v_client_b uuid;
  v_thread_b uuid;
BEGIN
  INSERT INTO public.clients (name, route_day, address)
  VALUES ('PR6 Portal Client A', 'Monday', '1 A St')
  RETURNING id INTO v_client_a;

  INSERT INTO public.clients (name, route_day, address)
  VALUES ('PR6 Portal Client B', 'Tuesday', '2 B St')
  RETURNING id INTO v_client_b;

  INSERT INTO public.portal_users (client_id, email, status)
  VALUES (v_client_a, 'portal-pr6@example.com', 'active');

  INSERT INTO public.message_threads (client_id, thread_type, entity_id, status)
  VALUES (v_client_b, 'general', NULL, 'open')
  RETURNING id INTO v_thread_b;

  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', gen_random_uuid()::text,
    'email', 'portal-pr6@example.com',
    'role', 'authenticated'
  )::text, true);

  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.messages (thread_id, sender, body)
    VALUES (v_thread_b, 'portal', 'Attempt cross-client message');

    RAISE EXCEPTION 'Test failed: portal user inserted message for another client';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' OR SQLERRM ILIKE '%row-level security%' THEN
        RAISE NOTICE 'PASS: portal user cannot message other clients';
      ELSE
        RAISE;
      END IF;
  END;

  EXECUTE 'RESET ROLE';

  DELETE FROM public.messages WHERE thread_id = v_thread_b;
  DELETE FROM public.message_threads WHERE id = v_thread_b;
  DELETE FROM public.portal_users WHERE email = 'portal-pr6@example.com';
  DELETE FROM public.clients WHERE id IN (v_client_a, v_client_b);
END $$;

-- 2) Automation throttle enforces at most 1 collections email / client / 72h
DO $$
DECLARE
  v_client_id uuid;
  v_invoice_1 uuid;
  v_invoice_2 uuid;
  v_count_after_first integer;
  v_count_after_second integer;
BEGIN
  INSERT INTO public.clients (name, route_day, address)
  VALUES ('PR6 Collections Client', 'Wednesday', '3 C St')
  RETURNING id INTO v_client_id;

  INSERT INTO public.invoices (client_id, invoice_number, status, total, due_at)
  VALUES (v_client_id, 'PR6-INV-1', 'sent', 125.00, now() - interval '10 days')
  RETURNING id INTO v_invoice_1;

  INSERT INTO public.invoices (client_id, invoice_number, status, total, due_at)
  VALUES (v_client_id, 'PR6-INV-2', 'sent', 250.00, now() - interval '10 days')
  RETURNING id INTO v_invoice_2;

  PERFORM public.queue_billing_automation_notifications(now());

  SELECT COUNT(*) INTO v_count_after_first
  FROM public.automation_notification_log
  WHERE client_id = v_client_id
    AND notification_kind LIKE 'invoice_%';

  PERFORM public.queue_billing_automation_notifications(now() + interval '1 hour');

  SELECT COUNT(*) INTO v_count_after_second
  FROM public.automation_notification_log
  WHERE client_id = v_client_id
    AND notification_kind LIKE 'invoice_%';

  IF v_count_after_first <> 1 THEN
    RAISE EXCEPTION 'Test failed: expected first run to queue exactly 1 collections email, got %', v_count_after_first;
  END IF;

  IF v_count_after_second <> v_count_after_first THEN
    RAISE EXCEPTION 'Test failed: throttle breached (first %, second %)', v_count_after_first, v_count_after_second;
  END IF;

  RAISE NOTICE 'PASS: collections throttle enforced at 72h window';

  DELETE FROM public.automation_notification_log WHERE client_id = v_client_id;
  DELETE FROM public.invoices WHERE id IN (v_invoice_1, v_invoice_2);
  DELETE FROM public.clients WHERE id = v_client_id;
END $$;
