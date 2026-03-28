do $$
declare
  has_portal_users_client_id boolean;
  has_portal_users_company_id boolean;
  has_client_accounts_client_id boolean;
  has_client_accounts_company_id boolean;
  has_client_job_access_job_id boolean;
  has_client_job_access_company_id boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'portal_users' and column_name = 'client_id'
  ) into has_portal_users_client_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'portal_users' and column_name = 'company_id'
  ) into has_portal_users_company_id;

  if has_portal_users_client_id and has_portal_users_company_id then
    execute $sql$
      update public.portal_users pu
      set company_id = c.company_id
      from public.clients c
      where pu.client_id = c.id
        and c.company_id is not null
        and (pu.company_id is null or pu.company_id <> c.company_id)
    $sql$;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_accounts' and column_name = 'client_id'
  ) into has_client_accounts_client_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_accounts' and column_name = 'company_id'
  ) into has_client_accounts_company_id;

  if has_client_accounts_client_id and has_client_accounts_company_id then
    execute $sql$
      update public.client_accounts ca
      set company_id = c.company_id
      from public.clients c
      where ca.client_id = c.id
        and c.company_id is not null
        and (ca.company_id is null or ca.company_id <> c.company_id)
    $sql$;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_job_access' and column_name = 'job_id'
  ) into has_client_job_access_job_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_job_access' and column_name = 'company_id'
  ) into has_client_job_access_company_id;

  if has_client_job_access_job_id and has_client_job_access_company_id then
    execute $sql$
      update public.client_job_access cja
      set company_id = j.company_id
      from public.jobs j
      where cja.job_id = j.id
        and j.company_id is not null
        and (cja.company_id is null or cja.company_id <> j.company_id)
    $sql$;
  end if;
end $$;
