begin;

create or replace function public.autofill_rug_company_id()
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

  if new.client_id is not null then
    select c.company_id
      into resolved_company_id
      from public.clients c
     where c.id = new.client_id;
  end if;

  if resolved_company_id is null and new.job_id is not null then
    select c.company_id
      into resolved_company_id
      from public.intake_jobs ij
      join public.clients c on c.id = ij.client_id
     where ij.id = new.job_id;
  end if;

  if resolved_company_id is null then
    resolved_company_id := public.get_user_company_id(auth.uid());
  end if;

  new.company_id := resolved_company_id;
  return new;
end;
$$;

create or replace function public.autofill_payment_company_id()
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

  if new.client_id is not null then
    select ca.company_id
      into resolved_company_id
      from public.client_accounts ca
     where ca.id = new.client_id;
  end if;

  if resolved_company_id is null and new.job_id is not null then
    select j.company_id
      into resolved_company_id
      from public.jobs j
     where j.id = new.job_id;
  end if;

  if resolved_company_id is null and new.invoice_id is not null then
    select i.company_id
      into resolved_company_id
      from public.invoices i
     where i.id = new.invoice_id;
  end if;

  if resolved_company_id is null then
    resolved_company_id := public.get_user_company_id(auth.uid());
  end if;

  new.company_id := resolved_company_id;
  return new;
end;
$$;

create or replace function public.enforce_rug_company_scope_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  client_company_id uuid;
  intake_job_company_id uuid;
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
    select c.company_id
      into intake_job_company_id
      from public.intake_jobs ij
      join public.clients c on c.id = ij.client_id
     where ij.id = new.job_id;

    if intake_job_company_id is not null and new.company_id is distinct from intake_job_company_id then
      raise exception 'rugs.company_id must match intake job client company_id'
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
  client_account_company_id uuid;
  job_company_id uuid;
  invoice_company_id uuid;
begin
  if new.client_id is not null then
    select ca.company_id
      into client_account_company_id
      from public.client_accounts ca
     where ca.id = new.client_id;

    if client_account_company_id is not null and new.company_id is distinct from client_account_company_id then
      raise exception 'payments.company_id must match client_accounts.company_id'
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

update public.rugs r
   set company_id = source.company_id
  from (
    select r_inner.id,
           coalesce(c.company_id, job_client.company_id) as company_id
      from public.rugs r_inner
      left join public.clients c on c.id = r_inner.client_id
      left join public.intake_jobs ij on ij.id = r_inner.job_id
      left join public.clients job_client on job_client.id = ij.client_id
  ) as source
 where r.id = source.id
   and source.company_id is not null
   and (r.company_id is null or r.company_id <> source.company_id);

update public.payments p
   set company_id = source.company_id
  from (
    select p_inner.id,
           coalesce(ca.company_id, j.company_id, i.company_id) as company_id
      from public.payments p_inner
      left join public.client_accounts ca on ca.id = p_inner.client_id
      left join public.jobs j on j.id = p_inner.job_id
      left join public.invoices i on i.id = p_inner.invoice_id
  ) as source
 where p.id = source.id
   and source.company_id is not null
   and (p.company_id is null or p.company_id <> source.company_id);

commit;
