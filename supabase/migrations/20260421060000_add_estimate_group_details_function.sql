create or replace function public.get_estimate_group_details(
  p_client_id uuid,
  p_status text
)
returns table (
  id uuid,
  rug_id uuid,
  client_id uuid,
  estimate_number text,
  status public.estimate_status,
  version integer,
  total numeric,
  created_at timestamptz,
  sent_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  client_name text,
  client_email text,
  rug_tag text
)
language sql
security invoker
set search_path = public
as $$
  select
    e.id,
    e.rug_id,
    e.client_id,
    e.estimate_number,
    e.status,
    e.version,
    e.total,
    e.created_at,
    e.sent_at,
    e.approved_at,
    e.rejected_at,
    c.name as client_name,
    c.email as client_email,
    r.tag as rug_tag
  from public.estimates e
  join public.clients c on c.id = e.client_id
  left join public.rugs r on r.id = e.rug_id
  where e.client_id = p_client_id
    and e.status::text = p_status
  order by e.created_at desc;
$$;

grant execute on function public.get_estimate_group_details(uuid, text) to authenticated;
