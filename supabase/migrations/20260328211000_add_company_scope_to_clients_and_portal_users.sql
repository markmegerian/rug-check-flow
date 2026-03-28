alter table public.clients
  add column if not exists company_id uuid references public.companies(id) on delete set null;

alter table public.portal_users
  add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists idx_clients_company_id on public.clients(company_id);
create index if not exists idx_portal_users_company_id on public.portal_users(company_id);

create or replace function public.assign_company_id_from_context()
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

  if tg_table_name = 'portal_users' and new.client_id is not null then
    select c.company_id into resolved_company_id
    from public.clients c
    where c.id = new.client_id;

    if resolved_company_id is not null then
      new.company_id := resolved_company_id;
      return new;
    end if;
  end if;

  resolved_company_id := public.get_user_company_id(auth.uid());
  if resolved_company_id is not null then
    new.company_id := resolved_company_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assign_clients_company_id on public.clients;
create trigger trg_assign_clients_company_id
before insert on public.clients
for each row
execute function public.assign_company_id_from_context();

drop trigger if exists trg_assign_portal_users_company_id on public.portal_users;
create trigger trg_assign_portal_users_company_id
before insert on public.portal_users
for each row
execute function public.assign_company_id_from_context();
