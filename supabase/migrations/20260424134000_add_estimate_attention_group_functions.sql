create or replace function public.get_estimate_attention_groups()
returns table (
  client_id uuid,
  client_name text,
  client_email text,
  company_name text,
  estimate_count bigint,
  total_amount numeric,
  review_count bigint,
  revision_count bigint,
  ready_count bigint,
  latest_created_at timestamptz,
  rug_tags text[],
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
    nullif(btrim(co.name), '') as company_name,
    count(*) as estimate_count,
    coalesce(sum(e.total), 0)::numeric as total_amount,
    count(*) filter (where e.status = 'needs_office_review') as review_count,
    count(*) filter (where e.status = 'needs_revision') as revision_count,
    count(*) filter (where e.status = 'ready_to_send') as ready_count,
    max(e.created_at) as latest_created_at,
    array_remove(array_agg(distinct nullif(btrim(r.tag), '')), null) as rug_tags,
    array_agg(e.id order by e.created_at desc) as estimate_ids
  from public.estimates e
  join public.clients c on c.id = e.client_id
  left join public.companies co on co.id = c.company_id
  left join public.rugs r on r.id = e.rug_id
  where e.status = any(array['needs_office_review', 'needs_revision', 'ready_to_send']::public.estimate_status[])
  group by c.id, c.name, c.email, co.name
  order by max(e.created_at) desc, c.name asc;
$$;

grant execute on function public.get_estimate_attention_groups() to authenticated;

create or replace function public.get_estimate_attention_group_details(
  p_client_id uuid
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
  company_name text,
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
    nullif(btrim(co.name), '') as company_name,
    r.tag as rug_tag
  from public.estimates e
  join public.clients c on c.id = e.client_id
  left join public.companies co on co.id = c.company_id
  left join public.rugs r on r.id = e.rug_id
  where e.client_id = p_client_id
    and e.status = any(array['needs_office_review', 'needs_revision', 'ready_to_send']::public.estimate_status[])
  order by
    case e.status
      when 'needs_office_review' then 0
      when 'needs_revision' then 1
      when 'ready_to_send' then 2
      else 3
    end,
    e.created_at desc;
$$;

grant execute on function public.get_estimate_attention_group_details(uuid) to authenticated;
