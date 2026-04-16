do $$
declare
  resolved_company_id uuid;
  company_count integer;
  client_company_count integer;
begin
  select count(*)
    into company_count
    from public.companies;

  if company_count = 1 then
    select id
      into resolved_company_id
      from public.companies
     limit 1;
  elsif company_count = 0 then
    select count(distinct company_id)
      into client_company_count
      from public.clients
     where company_id is not null;

    if client_company_count = 1 then
      select company_id
        into resolved_company_id
        from public.clients
       where company_id is not null
       limit 1;
    elsif client_company_count = 0 then
      raise exception 'Cannot backfill internal company memberships: no company row or client company_id found';
    else
      raise exception 'Cannot backfill internal company memberships: multiple client company_id values found';
    end if;
  else
    raise exception 'Cannot backfill internal company memberships automatically: multiple companies exist';
  end if;

  insert into public.company_memberships (company_id, user_id, role, invited_by)
  select
    resolved_company_id,
    internal_users.user_id,
    case
      when internal_users.has_admin then 'company_admin'::public.company_role
      else 'staff'::public.company_role
    end,
    null
  from (
    select
      ur.user_id,
      bool_or(ur.role = 'admin') as has_admin
    from public.user_roles ur
    where ur.role in ('admin', 'office', 'checkin_staff', 'driver', 'staff')
    group by ur.user_id
  ) as internal_users
  where not exists (
    select 1
      from public.company_memberships cm
     where cm.company_id = resolved_company_id
       and cm.user_id = internal_users.user_id
  );
end
$$;
