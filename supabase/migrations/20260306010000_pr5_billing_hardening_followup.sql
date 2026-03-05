-- PR-5 follow-up: enforce production billing hardening on existing baseline schema

ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'disputed';

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due numeric(12,2) NOT NULL DEFAULT 0;

UPDATE public.invoices
SET total_amount = COALESCE(total_amount, total, 0),
    balance_due = COALESCE(balance_due, total, 0)
WHERE total_amount = 0 AND balance_due = 0;

ALTER TABLE public.payments
  ALTER COLUMN job_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS received_at timestamptz,
  ADD COLUMN IF NOT EXISTS entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, invoice_id)
);

CREATE TABLE IF NOT EXISTS public.credit_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  reason text NOT NULL,
  total_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (total_amount <= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_memo_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_memo_id uuid NOT NULL REFERENCES public.credit_memos(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount < 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.recompute_invoice_balance(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric(12,2);
  v_allocated numeric(12,2);
  v_credits numeric(12,2);
  v_balance numeric(12,2);
BEGIN
  SELECT COALESCE(total_amount, total, 0) INTO v_total
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF v_total IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_allocated
  FROM public.payment_allocations
  WHERE invoice_id = p_invoice_id;

  SELECT COALESCE(SUM(cml.amount), 0) INTO v_credits
  FROM public.credit_memo_lines cml
  JOIN public.credit_memos cm ON cm.id = cml.credit_memo_id
  WHERE cm.invoice_id = p_invoice_id;

  v_balance := v_total - v_allocated + v_credits;

  UPDATE public.invoices
  SET
    total_amount = v_total,
    balance_due = v_balance,
    status = CASE
      WHEN status = 'disputed'::public.invoice_status THEN status
      WHEN v_balance <= 0 THEN 'paid'::public.invoice_status
      WHEN status = 'draft'::public.invoice_status THEN status
      ELSE 'sent'::public.invoice_status
    END
  WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_locked_invoice_financial_updates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IN ('sent'::public.invoice_status, 'overdue'::public.invoice_status, 'paid'::public.invoice_status, 'disputed'::public.invoice_status) THEN
    IF NEW.status IS DISTINCT FROM OLD.status
      AND NEW.client_id IS NOT DISTINCT FROM OLD.client_id
      AND NEW.total IS NOT DISTINCT FROM OLD.total
      AND NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal
      AND NEW.tax IS NOT DISTINCT FROM OLD.tax
      AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
      AND NEW.balance_due IS NOT DISTINCT FROM OLD.balance_due THEN
      RETURN NEW;
    END IF;

    IF NEW.client_id IS DISTINCT FROM OLD.client_id
      OR NEW.total IS DISTINCT FROM OLD.total
      OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
      OR NEW.tax IS DISTINCT FROM OLD.tax
      OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
      OR NEW.balance_due IS DISTINCT FROM OLD.balance_due THEN
      RAISE EXCEPTION 'Invoice % is immutable once status is %; only status transitions are allowed', OLD.id, OLD.status
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_locked_invoice_item_mutations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_invoice_id uuid;
  v_status public.invoice_status;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT status INTO v_status
  FROM public.invoices
  WHERE id = v_invoice_id;

  IF v_status IN ('sent'::public.invoice_status, 'overdue'::public.invoice_status, 'paid'::public.invoice_status, 'disputed'::public.invoice_status) THEN
    RAISE EXCEPTION 'Invoice item changes are blocked for invoice % with status %', v_invoice_id, v_status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_credit_memo_total(p_credit_memo_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total numeric(12,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM public.credit_memo_lines
  WHERE credit_memo_id = p_credit_memo_id;

  UPDATE public.credit_memos
  SET total_amount = v_total
  WHERE id = p_credit_memo_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_invoice_balance_from_allocation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_invoice_balance(OLD.invoice_id);
  ELSE
    PERFORM public.recompute_invoice_balance(NEW.invoice_id);
    IF TG_OP = 'UPDATE' AND NEW.invoice_id <> OLD.invoice_id THEN
      PERFORM public.recompute_invoice_balance(OLD.invoice_id);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_invoice_balance_from_credit_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_credit_memo_id uuid;
  v_invoice_id uuid;
BEGIN
  v_credit_memo_id := COALESCE(NEW.credit_memo_id, OLD.credit_memo_id);

  PERFORM public.refresh_credit_memo_total(v_credit_memo_id);

  SELECT invoice_id INTO v_invoice_id
  FROM public.credit_memos
  WHERE id = v_credit_memo_id;

  IF v_invoice_id IS NOT NULL THEN
    PERFORM public.recompute_invoice_balance(v_invoice_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_balance_from_allocation ON public.payment_allocations;
CREATE TRIGGER trg_sync_invoice_balance_from_allocation
AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
FOR EACH ROW
EXECUTE FUNCTION public.sync_invoice_balance_from_allocation();

DROP TRIGGER IF EXISTS trg_sync_invoice_balance_from_credit_line ON public.credit_memo_lines;
CREATE TRIGGER trg_sync_invoice_balance_from_credit_line
AFTER INSERT OR UPDATE OR DELETE ON public.credit_memo_lines
FOR EACH ROW
EXECUTE FUNCTION public.sync_invoice_balance_from_credit_line();

DROP TRIGGER IF EXISTS trg_block_locked_invoice_financial_updates ON public.invoices;
CREATE TRIGGER trg_block_locked_invoice_financial_updates
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.block_locked_invoice_financial_updates();

DROP TRIGGER IF EXISTS trg_block_locked_invoice_item_mutations ON public.invoice_items;
CREATE TRIGGER trg_block_locked_invoice_item_mutations
BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.block_locked_invoice_item_mutations();
