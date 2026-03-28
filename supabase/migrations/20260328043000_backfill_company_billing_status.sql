do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'companies'
      and column_name = 'billing_status'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'companies'
      and column_name = 'subscription_status'
  ) then
    update public.companies c
    set billing_status = c.subscription_status::public.company_billing_status
    where c.billing_status is null
      and c.subscription_status is not null
      and exists (
        select 1
        from pg_type t
        join pg_enum e on e.enumtypid = t.oid
        where t.typname = 'company_billing_status'
          and e.enumlabel = c.subscription_status
      );
  end if;
end $$;
