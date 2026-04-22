create or replace function public.get_production_board_snapshot()
returns table (
  id uuid,
  tag text,
  description text,
  status text,
  size_length numeric,
  size_width numeric,
  checked_in_at timestamptz,
  notes text,
  client_id uuid,
  client_name text,
  photo_url text,
  services jsonb,
  delivery_target_date date,
  delivery_status text
)
language sql
security invoker
set search_path = public
as $$
  with active_delivery_allocations as (
    select distinct on (dli.rug_id)
      dli.rug_id,
      dl.target_date,
      dl.status
    from public.delivery_list_items dli
    join public.delivery_lists dl on dl.id = dli.delivery_list_id
    where dl.status <> 'checked_out'
    order by dli.rug_id, dl.target_date desc nulls last, dl.created_at desc
  ),
  rug_service_rollup as (
    select
      rs.rug_id,
      jsonb_agg(
        jsonb_build_object(
          'name', coalesce(rs.service_name, 'Unknown'),
          'line_total', coalesce(rs.line_total, 0),
          'edges', coalesce(rs.edges, '{}'::text[]),
          'approval_status', coalesce(rs.approval_status, 'approved')
        )
        order by rs.created_at asc, rs.id asc
      ) as services
    from public.rug_services rs
    group by rs.rug_id
  )
  select
    r.id,
    r.tag,
    r.description,
    r.status,
    r.size_length,
    r.size_width,
    r.checked_in_at,
    r.notes,
    r.client_id,
    c.name as client_name,
    r.photo_url,
    coalesce(rsr.services, '[]'::jsonb) as services,
    ada.target_date as delivery_target_date,
    ada.status as delivery_status
  from public.rugs r
  left join public.clients c on c.id = r.client_id
  left join rug_service_rollup rsr on rsr.rug_id = r.id
  left join active_delivery_allocations ada on ada.rug_id = r.id
  order by r.checked_in_at desc;
$$;

grant execute on function public.get_production_board_snapshot() to authenticated;
