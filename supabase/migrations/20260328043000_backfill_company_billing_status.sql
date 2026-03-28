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
    update public.companies
    set billing_status = case lower(trim(subscription_status))
      when 'active' then 'active'::public.billing_status
      when 'trialing' then 'trialing'::public.billing_status
      when 'past_due' then 'past_due'::public.billing_status
      when 'past-due' then 'past_due'::public.billing_status
      when 'unpaid' then 'past_due'::public.billing_status
      when 'incomplete' then 'past_due'::public.billing_status
      when 'incomplete_expired' then 'past_due'::public.billing_status
      when 'canceled' then 'canceled'::public.billing_status
      when 'cancelled' then 'canceled'::public.billing_status
      else billing_status
    end
    where billing_status is null
      and subscription_status is not null;
  end if;
end $$;
