create or replace function public.enforce_rug_company_scope_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_company_id uuid;
  job_company_id uuid;
begin
  if new.client_id is not null then
    select c.company_id
      into client_company_id
      from public.clients c
     where c.id = new.client_id;

    if client_company_id is not null and new.company_id is distinct from client_company_id then
      raise exception 'rugs.company_id must match clients.company_id'
        using errcode = '23514';
    end if;
  end if;

  if new.job_id is not null then
    select j.company_id
      into job_company_id
      from public.jobs j
     where j.id = new.job_id;

    if job_company_id is not null and new.company_id is distinct from job_company_id then
      raise exception 'rugs.company_id must match jobs.company_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_invoice_company_scope_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_company_id uuid;
begin
  if new.client_id is not null then
    select c.company_id
      into client_company_id
      from public.clients c
     where c.id = new.client_id;

    if client_company_id is not null and new.company_id is distinct from client_company_id then
      raise exception 'invoices.company_id must match clients.company_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_payment_company_scope_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_company_id uuid;
  job_company_id uuid;
  invoice_company_id uuid;
begin
  if new.client_id is not null then
    select c.company_id
      into client_company_id
      from public.clients c
     where c.id = new.client_id;

    if client_company_id is not null and new.company_id is distinct from client_company_id then
      raise exception 'payments.company_id must match clients.company_id'
        using errcode = '23514';
    end if;
  end if;

  if new.job_id is not null then
    select j.company_id
      into job_company_id
      from public.jobs j
     where j.id = new.job_id;

    if job_company_id is not null and new.company_id is distinct from job_company_id then
      raise exception 'payments.company_id must match jobs.company_id'
        using errcode = '23514';
    end if;
  end if;

  if new.invoice_id is not null then
    select i.company_id
      into invoice_company_id
      from public.invoices i
     where i.id = new.invoice_id;

    if invoice_company_id is not null and new.company_id is distinct from invoice_company_id then
      raise exception 'payments.company_id must match invoices.company_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_approved_estimate_company_scope_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  job_company_id uuid;
  inspection_company_id uuid;
begin
  if new.job_id is not null then
    select j.company_id
      into job_company_id
      from public.jobs j
     where j.id = new.job_id;

    if job_company_id is not null and new.company_id is distinct from job_company_id then
      raise exception 'approved_estimates.company_id must match jobs.company_id'
        using errcode = '23514';
    end if;
  end if;

  if new.inspection_id is not null then
    select i.company_id
      into inspection_company_id
      from public.inspections i
     where i.id = new.inspection_id;

    if inspection_company_id is not null and new.company_id is distinct from inspection_company_id then
      raise exception 'approved_estimates.company_id must match inspections.company_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_service_completion_company_scope_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_company_id uuid;
begin
  if new.approved_estimate_id is not null then
    select ae.company_id
      into estimate_company_id
      from public.approved_estimates ae
     where ae.id = new.approved_estimate_id;

    if estimate_company_id is not null and new.company_id is distinct from estimate_company_id then
      raise exception 'service_completions.company_id must match approved_estimates.company_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_client_service_selection_company_scope_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  estimate_company_id uuid;
  access_company_id uuid;
begin
  if new.approved_estimate_id is not null then
    select ae.company_id
      into estimate_company_id
      from public.approved_estimates ae
     where ae.id = new.approved_estimate_id;

    if estimate_company_id is not null and new.company_id is distinct from estimate_company_id then
      raise exception 'client_service_selections.company_id must match approved_estimates.company_id'
        using errcode = '23514';
    end if;
  end if;

  if new.client_job_access_id is not null then
    select cja.company_id
      into access_company_id
      from public.client_job_access cja
     where cja.id = new.client_job_access_id;

    if access_company_id is not null and new.company_id is distinct from access_company_id then
      raise exception 'client_service_selections.company_id must match client_job_access.company_id'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_rug_company_scope_consistency on public.rugs;
create trigger trg_enforce_rug_company_scope_consistency
before insert or update on public.rugs
for each row
when (new.company_id is not null)
execute function public.enforce_rug_company_scope_consistency();

drop trigger if exists trg_enforce_invoice_company_scope_consistency on public.invoices;
create trigger trg_enforce_invoice_company_scope_consistency
before insert or update on public.invoices
for each row
when (new.company_id is not null)
execute function public.enforce_invoice_company_scope_consistency();

drop trigger if exists trg_enforce_payment_company_scope_consistency on public.payments;
create trigger trg_enforce_payment_company_scope_consistency
before insert or update on public.payments
for each row
when (new.company_id is not null)
execute function public.enforce_payment_company_scope_consistency();

drop trigger if exists trg_enforce_approved_estimate_company_scope_consistency on public.approved_estimates;
create trigger trg_enforce_approved_estimate_company_scope_consistency
before insert or update on public.approved_estimates
for each row
when (new.company_id is not null)
execute function public.enforce_approved_estimate_company_scope_consistency();

drop trigger if exists trg_enforce_service_completion_company_scope_consistency on public.service_completions;
create trigger trg_enforce_service_completion_company_scope_consistency
before insert or update on public.service_completions
for each row
when (new.company_id is not null)
execute function public.enforce_service_completion_company_scope_consistency();

drop trigger if exists trg_enforce_client_service_selection_company_scope_consistency on public.client_service_selections;
create trigger trg_enforce_client_service_selection_company_scope_consistency
before insert or update on public.client_service_selections
for each row
when (new.company_id is not null)
execute function public.enforce_client_service_selection_company_scope_consistency();
