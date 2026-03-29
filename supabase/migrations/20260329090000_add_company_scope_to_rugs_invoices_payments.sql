alter table public.rugs
  add column if not exists company_id uuid references public.companies(id) on delete set null;

alter table public.invoices
  add column if not exists company_id uuid references public.companies(id) on delete set null;

alter table public.payments
  add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists idx_rugs_company_id on public.rugs(company_id);
create index if not exists idx_invoices_company_id on public.invoices(company_id);
create index if not exists idx_payments_company_id on public.payments(company_id);

update public.rugs r
   set company_id = c.company_id
  from public.clients c
 where r.client_id = c.id
   and r.company_id is null
   and c.company_id is not null;

update public.invoices i
   set company_id = c.company_id
  from public.clients c
 where i.client_id = c.id
   and i.company_id is null
   and c.company_id is not null;

update public.payments p
   set company_id = c.company_id
  from public.clients c
 where p.client_id = c.id
   and p.company_id is null
   and c.company_id is not null;

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
    select j.company_id
      into resolved_company_id
      from public.jobs j
     where j.id = new.job_id;
  end if;

  if resolved_company_id is null then
    resolved_company_id := public.get_user_company_id(auth.uid());
  end if;

  new.company_id := resolved_company_id;
  return new;
end;
$$;

create or replace function public.autofill_invoice_company_id()
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
    select c.company_id
      into resolved_company_id
      from public.clients c
     where c.id = new.client_id;
  end if;

  if resolved_company_id is null and new.job_id is not null then
    select j.company_id
      into resolved_company_id
      from public.jobs j
     where j.id = new.job_id;
  end if;

  if resolved_company_id is null then
    resolved_company_id := public.get_user_company_id(auth.uid());
  end if;

  new.company_id := resolved_company_id;
  return new;
end;
$$;

drop trigger if exists trg_autofill_rug_company_id on public.rugs;
create trigger trg_autofill_rug_company_id
before insert or update on public.rugs
for each row
when (new.company_id is null)
execute function public.autofill_rug_company_id();

drop trigger if exists trg_autofill_invoice_company_id on public.invoices;
create trigger trg_autofill_invoice_company_id
before insert or update on public.invoices
for each row
when (new.company_id is null)
execute function public.autofill_invoice_company_id();

drop trigger if exists trg_autofill_payment_company_id on public.payments;
create trigger trg_autofill_payment_company_id
before insert or update on public.payments
for each row
when (new.company_id is null)
execute function public.autofill_payment_company_id();
