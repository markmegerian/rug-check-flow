-- PR-5 acceptance tests

-- 1) attempting to edit invoice_items for a sent invoice fails
DO $$
DECLARE
  v_client_id uuid;
  v_invoice_id uuid;
  v_item_id uuid;
BEGIN
  INSERT INTO public.clients (name, route_day, address)
  VALUES ('PR5 Locked Invoice Client', 'Thursday', '5 Billing St')
  RETURNING id INTO v_client_id;

  INSERT INTO public.invoices (client_id, invoice_number, status, total, subtotal, tax, total_amount, balance_due)
  VALUES (v_client_id, 'PR5-LOCK-1', 'sent', 100, 100, 0, 100, 100)
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total)
  VALUES (v_invoice_id, 'Initial line', 1, 100, 100)
  RETURNING id INTO v_item_id;

  BEGIN
    UPDATE public.invoice_items
    SET total = 90
    WHERE id = v_item_id;

    RAISE EXCEPTION 'Test failed: sent invoice line item update was not blocked';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%Invoice item changes are blocked%' THEN
        RAISE NOTICE 'PASS: sent invoice item mutation blocked';
      ELSE
        RAISE;
      END IF;
  END;

  DELETE FROM public.invoice_items WHERE id = v_item_id;
  DELETE FROM public.invoices WHERE id = v_invoice_id;
  DELETE FROM public.clients WHERE id = v_client_id;
END $$;

-- 2) balance updates correctly with allocations and credit memos
DO $$
DECLARE
  v_client_id uuid;
  v_invoice_id uuid;
  v_payment_id uuid;
  v_credit_id uuid;
  v_balance_after_payment numeric;
  v_balance_after_credit numeric;
BEGIN
  INSERT INTO public.clients (name, route_day, address)
  VALUES ('PR5 Balance Client', 'Friday', '7 Ledger Ave')
  RETURNING id INTO v_client_id;

  INSERT INTO public.invoices (client_id, invoice_number, status, total, subtotal, tax, total_amount, balance_due)
  VALUES (v_client_id, 'PR5-BAL-1', 'sent', 200, 200, 0, 200, 200)
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.payments (job_id, client_id, amount, status, method, received_at)
  VALUES (NULL, v_client_id, 80, 'succeeded', 'check', now())
  RETURNING id INTO v_payment_id;

  INSERT INTO public.payment_allocations (payment_id, invoice_id, amount)
  VALUES (v_payment_id, v_invoice_id, 80);

  SELECT balance_due INTO v_balance_after_payment
  FROM public.invoices
  WHERE id = v_invoice_id;

  IF v_balance_after_payment <> 120 THEN
    RAISE EXCEPTION 'Test failed: expected balance 120 after payment, got %', v_balance_after_payment;
  END IF;

  INSERT INTO public.credit_memos (invoice_id, reason)
  VALUES (v_invoice_id, 'Price adjustment')
  RETURNING id INTO v_credit_id;

  INSERT INTO public.credit_memo_lines (credit_memo_id, description, amount)
  VALUES (v_credit_id, 'Adjustment line', -20);

  SELECT balance_due INTO v_balance_after_credit
  FROM public.invoices
  WHERE id = v_invoice_id;

  IF v_balance_after_credit <> 100 THEN
    RAISE EXCEPTION 'Test failed: expected balance 100 after credit memo, got %', v_balance_after_credit;
  END IF;

  RAISE NOTICE 'PASS: invoice balance syncs with allocations and credits';

  DELETE FROM public.credit_memo_lines WHERE credit_memo_id = v_credit_id;
  DELETE FROM public.credit_memos WHERE id = v_credit_id;
  DELETE FROM public.payment_allocations WHERE payment_id = v_payment_id;
  DELETE FROM public.payments WHERE id = v_payment_id;
  DELETE FROM public.invoices WHERE id = v_invoice_id;
  DELETE FROM public.clients WHERE id = v_client_id;
END $$;
