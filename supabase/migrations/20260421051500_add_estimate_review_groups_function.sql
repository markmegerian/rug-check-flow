create or replace function public.get_estimate_review_groups()
returns table (
  client_id uuid,
  client_name text,
  client_email text,
  company_name text,
  status text,
  estimate_count bigint,
  total_amount numeric,
  ready_count bigint,
  review_count bigint,
  sent_count bigint,
  latest_created_at timestamptz,
  estimate_ids uuid[]
)
language sql
security invoker
set search_path = public
as $$
  select
    c.id as client_id,
    c.name as client_name,
    c.email as client_email,
    coalesce(co.name, null) as company_name,
    e.status::text as status,
    count(*) as estimate_count,
    coalesce(sum(e.total), 0)::numeric as total_amount,
    count(*) filter (where e.status = 'ready_to_send') as ready_count,
    count(*) filter (where e.status = 'needs_office_review') as review_count,
    count(*) filter (where e.status = 'sent') as sent_count,
    max(e.created_at) as latest_created_at,
    array_agg(e.id order by e.created_at desc) as estimate_ids
  from public.estimates e
  join public.clients c on c.id = e.client_id
  left join public.rugs r on r.id = e.rug_id
  left join public.company_memberships cm on cm.company_id = r.company_id
  left join public.companies co on co.id = cm.company_id
  group by c.id, c.name, c.email, co.name, e.status
  order by max(e.created_at) desc, c.name asc;
$$;

grant execute on function public.get_estimate_review_groups() to authenticated;
