create or replace function public.get_delivery_route_overview()
returns table (
  route_day text,
  client_id uuid,
  client_name text,
  client_address text,
  delivery_list_id uuid,
  target_date date,
  list_status public.delivery_list_status,
  confirmed_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz,
  rug_count bigint
)
language sql
security invoker
set search_path = public
as $$
  with route_clients as (
    select
      c.id as client_id,
      c.name as client_name,
      c.address as client_address,
      c.route_day
    from public.clients c
    where c.route_day is not null
      and c.route_day <> ''
  ),
  list_counts as (
    select
      dli.delivery_list_id,
      count(*)::bigint as rug_count
    from public.delivery_list_items dli
    group by dli.delivery_list_id
  )
  select
    rc.route_day,
    rc.client_id,
    rc.client_name,
    rc.client_address,
    dl.id as delivery_list_id,
    dl.target_date,
    dl.status as list_status,
    dl.confirmed_at,
    dl.checked_out_at,
    dl.created_at,
    coalesce(lc.rug_count, 0)::bigint as rug_count
  from route_clients rc
  left join public.delivery_lists dl on dl.route_day = rc.route_day
  left join list_counts lc on lc.delivery_list_id = dl.id
  order by rc.route_day asc, rc.client_name asc, dl.target_date desc nulls last, dl.created_at desc nulls last;
$$;

grant execute on function public.get_delivery_route_overview() to authenticated;
