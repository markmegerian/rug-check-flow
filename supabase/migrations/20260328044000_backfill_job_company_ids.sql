do $$
declare
  has_jobs_company_id boolean;
  has_jobs_client_id boolean;
  has_clients_company_id boolean;
  has_inspections_job_id boolean;
  has_inspections_company_id boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'company_id'
  ) into has_jobs_company_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'client_id'
  ) into has_jobs_client_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'company_id'
  ) into has_clients_company_id;

  if has_jobs_company_id and has_jobs_client_id and has_clients_company_id then
    execute $sql$
      update public.jobs j
      set company_id = c.company_id
      from public.clients c
      where j.client_id = c.id
        and c.company_id is not null
        and (j.company_id is null or j.company_id <> c.company_id)
    $sql$;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inspections' and column_name = 'job_id'
  ) into has_inspections_job_id;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'inspections' and column_name = 'company_id'
  ) into has_inspections_company_id;

  if has_jobs_company_id and has_inspections_job_id and has_inspections_company_id then
    execute $sql$
      with inspection_company as (
        select distinct on (job_id) job_id, company_id
        from public.inspections
        where job_id is not null
          and company_id is not null
        order by job_id, company_id
      )
      update public.jobs j
      set company_id = ic.company_id
      from inspection_company ic
      where ic.job_id = j.id
        and (j.company_id is null or j.company_id <> ic.company_id)
    $sql$;
  end if;
end $$;
