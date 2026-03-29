alter table public.approved_estimates
  add column if not exists company_id uuid references public.companies(id) on delete set null;

alter table public.service_completions
  add column if not exists company_id uuid references public.companies(id) on delete set null;

alter table public.client_service_selections
  add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists idx_approved_estimates_company_id on public.approved_estimates(company_id);
create index if not exists idx_service_completions_company_id on public.service_completions(company_id);
create index if not exists idx_client_service_selections_company_id on public.client_service_selections(company_id);

update public.approved_estimates ae
   set company_id = source.company_id
  from (
    select ae_inner.id, coalesce(j.company_id, i.company_id) as company_id
      from public.approved_estimates ae_inner
      left join public.jobs j on j.id = ae_inner.job_id
      left join public.inspections i on i.id = ae_inner.inspection_id
  ) as source
 where ae.id = source.id
   and ae.company_id is null
   and source.company_id is not null;

update public.approved_estimates ae
   set company_id = i.company_id
  from public.inspections i
 where ae.inspection_id = i.id
   and ae.company_id is null
   and i.company_id is not null;

update public.service_completions sc
   set company_id = ae.company_id
  from public.approved_estimates ae
 where sc.approved_estimate_id = ae.id
   and sc.company_id is null
   and ae.company_id is not null;

update public.client_service_selections css
   set company_id = coalesce(ae.company_id, cja.company_id)
  from public.approved_estimates ae,
       public.client_job_access cja
 where css.approved_estimate_id = ae.id
   and css.client_job_access_id = cja.id
   and css.company_id is null
   and coalesce(ae.company_id, cja.company_id) is not null;

update public.client_service_selections css
   set company_id = cja.company_id
  from public.client_job_access cja
 where css.client_job_access_id = cja.id
   and css.company_id is null
   and cja.company_id is not null;

create or replace function public.autofill_approved_estimate_company_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_company_id uuid;
begin
  if new.company_id is not null then
    return new;
  end if;

  if new.job_id is not null then
    select j.company_id
      into resolved_company_id
      from public.jobs j
     where j.id = new.job_id;
  end if;

  if resolved_company_id is null and new.inspection_id is not null then
    select i.company_id
      into resolved_company_id
      from public.inspections i
     where i.id = new.inspection_id;
  end if;

  if resolved_company_id is null then
    resolved_company_id := public.get_user_company_id(auth.uid());
  end if;

  new.company_id := resolved_company_id;
  return new;
end;
$$;

create or replace function public.autofill_service_completion_company_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_company_id uuid;
begin
  if new.company_id is not null then
    return new;
  end if;

  if new.approved_estimate_id is not null then
    select ae.company_id
      into resolved_company_id
      from public.approved_estimates ae
     where ae.id = new.approved_estimate_id;
  end if;

  if resolved_company_id is null then
    resolved_company_id := public.get_user_company_id(auth.uid());
  end if;

  new.company_id := resolved_company_id;
  return new;
end;
$$;

create or replace function public.autofill_client_service_selection_company_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_company_id uuid;
begin
  if new.company_id is not null then
    return new;
  end if;

  if new.approved_estimate_id is not null then
    select ae.company_id
      into resolved_company_id
      from public.approved_estimates ae
     where ae.id = new.approved_estimate_id;
  end if;

  if resolved_company_id is null and new.client_job_access_id is not null then
    select cja.company_id
      into resolved_company_id
      from public.client_job_access cja
     where cja.id = new.client_job_access_id;
  end if;

  if resolved_company_id is null then
    resolved_company_id := public.get_user_company_id(auth.uid());
  end if;

  new.company_id := resolved_company_id;
  return new;
end;
$$;

drop trigger if exists trg_autofill_approved_estimate_company_id on public.approved_estimates;
create trigger trg_autofill_approved_estimate_company_id
before insert or update on public.approved_estimates
for each row
when (new.company_id is null)
execute function public.autofill_approved_estimate_company_id();

drop trigger if exists trg_autofill_service_completion_company_id on public.service_completions;
create trigger trg_autofill_service_completion_company_id
before insert or update on public.service_completions
for each row
when (new.company_id is null)
execute function public.autofill_service_completion_company_id();

drop trigger if exists trg_autofill_client_service_selection_company_id on public.client_service_selections;
create trigger trg_autofill_client_service_selection_company_id
before insert or update on public.client_service_selections
for each row
when (new.company_id is null)
execute function public.autofill_client_service_selection_company_id();
