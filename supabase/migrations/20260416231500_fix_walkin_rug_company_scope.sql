begin;

create or replace function public.autofill_rug_company_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_company_id uuid;
  single_company_id uuid;
  single_company_count integer;
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

  if resolved_company_id is null and new.checked_in_by is not null then
    select cm.company_id
      into resolved_company_id
      from public.company_memberships cm
     where cm.user_id = new.checked_in_by
     order by case when cm.role = 'company_admin' then 0 else 1 end, cm.created_at asc
     limit 1;
  end if;

  if resolved_company_id is null then
    select count(*)
      into single_company_count
      from public.companies;

    if single_company_count = 1 then
      select id
        into single_company_id
        from public.companies
       limit 1;
      resolved_company_id := single_company_id;
    end if;
  end if;

  new.company_id := resolved_company_id;
  return new;
end;
$$;

update public.rugs r
   set company_id = source.company_id
  from (
    select r_inner.id,
           coalesce(
             client_company.company_id,
             intake_client.company_id,
             membership_company.company_id,
             single_company.company_id
           ) as company_id
      from public.rugs r_inner
      left join public.clients client_company on client_company.id = r_inner.client_id
      left join public.intake_jobs ij on ij.id = r_inner.job_id
      left join public.clients intake_client on intake_client.id = ij.client_id
      left join lateral (
        select cm.company_id
          from public.company_memberships cm
         where cm.user_id = r_inner.checked_in_by
         order by case when cm.role = 'company_admin' then 0 else 1 end, cm.created_at asc
         limit 1
      ) membership_company on true
      left join lateral (
        select c.id as company_id
          from public.companies c
         where (select count(*) from public.companies) = 1
         limit 1
      ) single_company on true
  ) as source
 where r.id = source.id
   and r.company_id is null
   and source.company_id is not null;

commit;
