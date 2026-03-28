do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = ''public''
      and table_name = ''companies''
      and column_name = ''billing_status''
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = ''public''
      and table_name = ''companies''
      and column_name = ''subscription_status''
  ) then
    update public.companies
    set billing_status = case lower(subscription_status)
      when ''active'' then ''active''::public.company_billing_status
      when ''trialing'' then ''trialing''::public.company_billing_status
      when ''past_due'' then ''past_due''::public.company_billing_status
      when ''canceled'' then ''canceled''::public.company_billing_status
      when ''unpaid'' then ''unpaid''::public.company_billing_status
      else billing_status
    end
    where billing_status is null
      and subscription_status is not null;
  end if;
end $$;
