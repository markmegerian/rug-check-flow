create or replace function public.get_delivery_prep_snapshot(p_target_date date)
returns table (
  delivery_list_id uuid,
  route_day text,
  target_date date,
  list_status public.delivery_list_status,
  client_id uuid,
  client_name text,
  client_address text,
  rug_id uuid,
  rug_tag text,
  rug_description text,
  rug_status text,
  size_length numeric,
  size_width numeric,
  confirmed_for_delivery boolean,
  loaded_on_truck boolean
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_route_day text;
  v_list_id uuid;
begin
  v_route_day := trim(to_char(p_target_date::timestamp, 'Day'));

  select dl.id
  into v_list_id
  from public.delivery_lists dl
  where dl.target_date = p_target_date
    and dl.route_day = v_route_day
    and dl.status in ('compiling', 'confirmed')
  order by dl.created_at asc
  limit 1;

  if v_list_id is null then
    insert into public.delivery_lists (route_day, target_date)
    values (v_route_day, p_target_date)
    returning id into v_list_id;
  end if;

  insert into public.delivery_list_items (delivery_list_id, rug_id, client_id)
  select
    v_list_id,
    r.id,
    r.client_id
  from public.rugs r
  join public.clients c on c.id = r.client_id
  where c.route_day = v_route_day
    and r.client_id is not null
    and r.status = any (array['checked_in', 'in_production', 'ready'])
    and not exists (
      select 1
      from public.delivery_list_items dli
      where dli.delivery_list_id = v_list_id
        and dli.rug_id = r.id
    );

  return query
  select
    dl.id as delivery_list_id,
    dl.route_day,
    dl.target_date,
    dl.status as list_status,
    c.id as client_id,
    c.name as client_name,
    c.address as client_address,
    r.id as rug_id,
    r.tag as rug_tag,
    r.description as rug_description,
    r.status as rug_status,
    r.size_length,
    r.size_width,
    coalesce(dli.confirmed_for_delivery, false) as confirmed_for_delivery,
    coalesce(dli.loaded_on_truck, false) as loaded_on_truck
  from public.delivery_lists dl
  join public.delivery_list_items dli on dli.delivery_list_id = dl.id
  join public.rugs r on r.id = dli.rug_id
  join public.clients c on c.id = r.client_id
  where dl.id = v_list_id
    and c.route_day = v_route_day
    and r.status = any (array['checked_in', 'in_production', 'ready'])
  order by c.name asc, r.tag asc;
end;
$$;

grant execute on function public.get_delivery_prep_snapshot(date) to authenticated;
