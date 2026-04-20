create or replace function public.get_thread_summaries(p_client_id uuid default null)
returns table (
  id uuid,
  client_id uuid,
  entity_id uuid,
  thread_type public.thread_type,
  status public.thread_status,
  created_at timestamptz,
  updated_at timestamptz,
  client jsonb,
  entity_label text,
  last_message_at timestamptz,
  last_message_body text,
  last_message_sender uuid,
  message_count bigint,
  visible_message_count bigint,
  unread boolean
)
language sql
security invoker
set search_path = public
as $$
with thread_scope as (
  select
    mt.id,
    mt.client_id,
    mt.entity_id,
    mt.thread_type,
    mt.status,
    mt.created_at,
    mt.updated_at,
    c.id as client_ref_id,
    c.name as client_name,
    c.contact_name as client_contact_name,
    c.email as client_email
  from public.message_threads mt
  join public.clients c on c.id = mt.client_id
  where p_client_id is null or mt.client_id = p_client_id
),
message_rollup as (
  select
    m.thread_id,
    max(m.created_at) as last_message_at,
    count(*) as message_count,
    count(*) filter (
      where coalesce((m.attachments->0->>'visibility') <> 'internal', true)
    ) as visible_message_count,
    (
      array_agg(m.body order by m.created_at desc)
      filter (where coalesce((m.attachments->0->>'visibility') <> 'internal', true))
    )[1] as last_visible_body,
    (
      array_agg(m.sender order by m.created_at desc)
      filter (where coalesce((m.attachments->0->>'visibility') <> 'internal', true))
    )[1] as last_visible_sender,
    (
      array_agg(m.created_at order by m.created_at desc)
      filter (where coalesce((m.attachments->0->>'visibility') <> 'internal', true))
    )[1] as last_visible_at,
    max(m.created_at) filter (where m.sender is not null) as latest_inbound_at,
    max(m.created_at) filter (where m.sender = auth.uid()) as latest_self_at
  from public.messages m
  join thread_scope ts on ts.id = m.thread_id
  group by m.thread_id
),
estimate_labels as (
  select e.id, e.estimate_number as label
  from public.estimates e
  join thread_scope ts on ts.thread_type = 'estimate' and ts.entity_id = e.id
),
invoice_labels as (
  select i.id, i.invoice_number as label
  from public.invoices i
  join thread_scope ts on ts.thread_type = 'invoice' and ts.entity_id = i.id
)
select
  ts.id,
  ts.client_id,
  ts.entity_id,
  ts.thread_type,
  ts.status,
  ts.created_at,
  ts.updated_at,
  jsonb_build_object(
    'id', ts.client_ref_id,
    'name', ts.client_name,
    'contact_name', ts.client_contact_name,
    'email', ts.client_email
  ) as client,
  case
    when ts.thread_type = 'estimate' then el.label
    when ts.thread_type = 'invoice' then il.label
    else null
  end as entity_label,
  coalesce(mr.last_visible_at, mr.last_message_at) as last_message_at,
  mr.last_visible_body as last_message_body,
  mr.last_visible_sender as last_message_sender,
  coalesce(mr.message_count, 0) as message_count,
  coalesce(mr.visible_message_count, 0) as visible_message_count,
  case
    when mr.latest_inbound_at is null then false
    when auth.uid() is null then true
    when mr.latest_self_at is null then true
    else mr.latest_inbound_at > mr.latest_self_at
  end as unread
from thread_scope ts
left join message_rollup mr on mr.thread_id = ts.id
left join estimate_labels el on el.id = ts.entity_id and ts.thread_type = 'estimate'
left join invoice_labels il on il.id = ts.entity_id and ts.thread_type = 'invoice'
order by coalesce(mr.last_visible_at, mr.last_message_at, ts.updated_at) desc;
$$;

grant execute on function public.get_thread_summaries(uuid) to authenticated;
