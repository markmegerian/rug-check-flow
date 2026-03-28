do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name = 'company_id'
  ) and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'jobs'
      and column_name = 'client_id'
  ) then
    update public.jobs j
    set company_id = c.company_id
    from public.clients c
    where j.client_id = c.id
      and c.company_id is not null
      and (j.company_id is null or j.company_id <> c.company_id);
  end if;
end $$;
