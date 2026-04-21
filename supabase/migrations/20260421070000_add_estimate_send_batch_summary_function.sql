create or replace function public.get_estimate_send_batch_summaries()
returns table (
  batch_id uuid,
  client_id uuid,
  company_id uuid,
  client_name text,
  client_email text,
  status text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  estimate_count integer,
  total_amount numeric,
  estimate_ids uuid[]
)
language sql
security invoker
set search_path = public
as $$
  select
    b.id as batch_id,
    b.client_id,
    b.company_id,
    c.name as client_name,
    c.email as client_email,
    b.status,
    b.scheduled_for,
    b.sent_at,
    count(i.estimate_id)::integer as estimate_count,
    coalesce(sum(e.total), 0)::numeric as total_amount,
    coalesce(array_agg(i.estimate_id order by e.created_at desc) filter (where i.estimate_id is not null), '{}'::uuid[]) as estimate_ids
  from public.estimate_send_batches b
  join public.clients c on c.id = b.client_id
  left join public.estimate_send_batch_items i on i.batch_id = b.id
  left join public.estimates e on e.id = i.estimate_id
  group by b.id, b.client_id, b.company_id, c.name, c.email, b.status, b.scheduled_for, b.sent_at
  order by coalesce(b.sent_at, b.scheduled_for) desc, b.created_at desc;
$$;

grant execute on function public.get_estimate_send_batch_summaries() to authenticated;
