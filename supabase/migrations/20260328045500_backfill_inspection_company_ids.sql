do $$
declare
  has_inspections_company_id boolean;
  has_inspections_client_id boolean;
  has_inspections_job_id boolean;
  has_clients_company_id boolean;
  has_jobs_company_id boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inspections' and column_name = 'company_id'
  ) into has_inspections_company_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inspections' and column_name = 'client_id'
  ) into has_inspections_client_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inspections' and column_name = 'job_id'
  ) into has_inspections_job_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'company_id'
  ) into has_clients_company_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'company_id'
  ) into has_jobs_company_id;

  if has_inspections_company_id and has_inspections_client_id and has_clients_company_id then
    execute $sql$
      update public.inspections i
      set company_id = c.company_id
      from public.clients c
      where i.client_id = c.id
        and c.company_id is not null
        and (i.company_id is null or i.company_id <> c.company_id)
    $sql$;
  end if;

  if has_inspections_company_id and has_inspections_job_id and has_jobs_company_id then
    execute $sql$
      update public.inspections i
      set company_id = j.company_id
      from public.jobs j
      where i.job_id = j.id
        and j.company_id is not null
        and (i.company_id is null or i.company_id <> j.company_id)
    $sql$;
  end if;
end $$;
