do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rugs' and column_name = 'company_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rugs' and column_name = 'client_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'company_id'
  ) then
    update public.rugs r
    set company_id = c.company_id
    from public.clients c
    where r.client_id = c.id
      and c.company_id is not null
      and (r.company_id is null or r.company_id <> c.company_id);
  end if;
end $$;
