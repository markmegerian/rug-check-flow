-- Phase 5: ensure payment_attempts ledger is populated when invoices are marked paid
CREATE OR REPLACE FUNCTION public.log_payment_attempt_on_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid'
    AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid')
  THEN
    INSERT INTO public.payment_attempts (
      invoice_id,
      client_id,
      provider,
      provider_payment_ref,
      amount,
      status,
      attempted_at,
      metadata
    )
    VALUES (
      NEW.id,
      NEW.client_id,
      'manual',
      'office-status-transition',
      COALESCE(NEW.total, 0),
      'succeeded',
      COALESCE(NEW.paid_at, now()),
      jsonb_build_object(
        'source', 'invoice_status_transition',
        'trigger_op', TG_OP,
        'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status ELSE NULL END,
        'changed_by', auth.uid()
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_payment_attempt_on_invoice_paid ON public.invoices;
CREATE TRIGGER trg_log_payment_attempt_on_invoice_paid
AFTER INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.log_payment_attempt_on_invoice_paid();
