create or replace function public.assign_clients_company_id_from_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := public.get_user_company_id(auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.assign_portal_users_company_id_from_context()
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
    select c.company_id into resolved_company_id
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

drop trigger if exists trg_assign_clients_company_id on public.clients;
create trigger trg_assign_clients_company_id
before insert on public.clients
for each row
execute function public.assign_clients_company_id_from_context();

drop trigger if exists trg_assign_portal_users_company_id on public.portal_users;
create trigger trg_assign_portal_users_company_id
before insert on public.portal_users
for each row
execute function public.assign_portal_users_company_id_from_context();

drop function if exists public.assign_company_id_from_context();
