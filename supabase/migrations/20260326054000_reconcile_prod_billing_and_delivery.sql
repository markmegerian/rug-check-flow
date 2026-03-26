-- Reconcile production schema with current RugBoost app expectations without replaying
-- brittle historical migrations that no longer match the live baseline exactly.

-- Invoice/account billing fields expected by newer app flows
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS subtotal numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_due numeric(12,2) NOT NULL DEFAULT 0;

UPDATE public.invoices
SET total_amount = COALESCE(NULLIF(total_amount, 0), total, 0),
    balance_due = COALESCE(NULLIF(balance_due, 0), balance, total, 0)
WHERE total_amount = 0 OR balance_due = 0;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.payment_allocations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.credit_memos
  ADD COLUMN IF NOT EXISTS reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.credit_memo_lines
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS payment_allocations_payment_invoice_unique
  ON public.payment_allocations(payment_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice_id
  ON public.payment_allocations(invoice_id);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_id
  ON public.payment_allocations(payment_id);

-- Keep invoice balance fields aligned with existing baseline tables
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

  SELECT COALESCE(SUM(amount), 0) INTO v_credits
  FROM public.credit_memo_lines
  WHERE invoice_id = p_invoice_id;

  v_balance := v_total - v_allocated - v_credits;

  UPDATE public.invoices
  SET total_amount = v_total,
      balance_due = GREATEST(v_balance, 0)
  WHERE id = p_invoice_id;
END;
$$;

-- Delivery list dedupe / uniqueness expected by newer route-stop work
DELETE FROM public.delivery_list_items
WHERE id NOT IN (
  SELECT DISTINCT ON (delivery_list_id, rug_id) id
  FROM public.delivery_list_items
  ORDER BY delivery_list_id, rug_id, created_at ASC
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'delivery_list_items_list_rug_unique'
  ) then
    alter table public.delivery_list_items
      add constraint delivery_list_items_list_rug_unique
      unique (delivery_list_id, rug_id);
  end if;
end $$;
