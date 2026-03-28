do $$
declare
  has_approved_estimates_company_id boolean;
  has_approved_estimates_inspection_id boolean;
  has_client_service_selections_company_id boolean;
  has_client_service_selections_approved_estimate_id boolean;
  has_service_completions_company_id boolean;
  has_service_completions_inspection_id boolean;
  has_payments_company_id boolean;
  has_payments_client_id boolean;
  has_payments_invoice_id boolean;
  has_invoices_company_id boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'approved_estimates' and column_name = 'company_id'
  ) into has_approved_estimates_company_id;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'approved_estimates' and column_name = 'inspection_id'
  ) into has_approved_estimates_inspection_id;

  if has_approved_estimates_company_id and has_approved_estimates_inspection_id then
    execute $sql$
      update public.approved_estimates ae
      set company_id = i.company_id
      from public.inspections i
      where ae.inspection_id = i.id
        and i.company_id is not null
        and (ae.company_id is null or ae.company_id <> i.company_id)
    $sql$;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_service_selections' and column_name = 'company_id'
  ) into has_client_service_selections_company_id;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_service_selections' and column_name = 'approved_estimate_id'
  ) into has_client_service_selections_approved_estimate_id;

  if has_client_service_selections_company_id and has_client_service_selections_approved_estimate_id then
    execute $sql$
      update public.client_service_selections css
      set company_id = ae.company_id
      from public.approved_estimates ae
      where css.approved_estimate_id = ae.id
        and ae.company_id is not null
        and (css.company_id is null or css.company_id <> ae.company_id)
    $sql$;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_completions' and column_name = 'company_id'
  ) into has_service_completions_company_id;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'service_completions' and column_name = 'inspection_id'
  ) into has_service_completions_inspection_id;

  if has_service_completions_company_id and has_service_completions_inspection_id then
    execute $sql$
      update public.service_completions sc
      set company_id = i.company_id
      from public.inspections i
      where sc.inspection_id = i.id
        and i.company_id is not null
        and (sc.company_id is null or sc.company_id <> i.company_id)
    $sql$;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'company_id'
  ) into has_payments_company_id;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'client_id'
  ) into has_payments_client_id;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'invoice_id'
  ) into has_payments_invoice_id;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'company_id'
  ) into has_invoices_company_id;

  if has_payments_company_id and has_payments_client_id then
    execute $sql$
      update public.payments p
      set company_id = c.company_id
      from public.clients c
      where p.client_id = c.id
        and c.company_id is not null
        and (p.company_id is null or p.company_id <> c.company_id)
    $sql$;
  end if;

  if has_payments_company_id and has_payments_invoice_id and has_invoices_company_id then
    execute $sql$
      update public.payments p
      set company_id = i.company_id
      from public.invoices i
      where p.invoice_id = i.id
        and i.company_id is not null
        and (p.company_id is null or p.company_id <> i.company_id)
    $sql$;
  end if;
end $$;
