create or replace function public.get_jobs_summary()
returns table (
  job_key text,
  source_type text,
  client_id uuid,
  client_name text,
  client_address text,
  scheduled_date date,
  route_day text,
  request_ids uuid[],
  primary_request_id uuid,
  statuses public.pickup_request_status[],
  updated_at timestamptz,
  notes text[],
  items jsonb
)
language sql
security invoker
set search_path = public
as $$
with request_scope as (
  select
    pr.id,
    pr.client_id,
    pr.route_day,
    pr.scheduled_date,
    pr.status,
    pr.notes,
    pr.updated_at,
    c.name as client_name,
    c.address as client_address
  from public.pickup_requests pr
  left join public.clients c on c.id = pr.client_id
),
rug_scope as (
  select
    r.id,
    r.client_id,
    r.tag,
    r.description,
    r.status,
    r.photo_url,
    r.size_length,
    r.size_width,
    r.checked_in_at,
    r.completed_at,
    r.intake_date,
    r.intake_source
  from public.rugs r
),
service_totals as (
  select
    rs.rug_id,
    array_remove(array_agg(distinct nullif(btrim(rs.service_name), '')), null) as linked_services,
    coalesce(sum(rs.line_total), 0) as linked_service_total
  from public.rug_services rs
  group by rs.rug_id
),
estimate_responses as (
  select distinct on (ce.rug_id)
    ce.rug_id,
    case when ce.event_type = 'estimate_approved_by_client' then 'approved' else 'rejected' end as status,
    ce.subject,
    ce.created_at
  from public.communication_events ce
  where ce.rug_id is not null
    and ce.event_type in ('estimate_approved_by_client', 'estimate_rejected_by_client')
  order by ce.rug_id, ce.created_at desc
),
invoice_links as (
  select distinct on (ii.rug_id)
    ii.rug_id,
    i.id,
    i.invoice_number,
    i.status,
    i.created_at,
    i.issued_at
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  where ii.rug_id is not null
  order by ii.rug_id, coalesce(i.issued_at, i.created_at) desc, i.created_at desc
),
return_events as (
  select
    ce.rug_id,
    array_agg(
      jsonb_build_object(
        'event_type', ce.event_type,
        'created_at', ce.created_at
      )
      order by ce.created_at desc
    ) as events
  from public.communication_events ce
  where ce.rug_id is not null
    and ce.event_type in ('rug_immediate_return_logged', 'rug_reentry_logged', 'rug_return_resolved')
  group by ce.rug_id
),
request_item_rows as (
  select
    concat(
      pr.client_id::text,
      '__',
      case when coalesce(r.intake_source, 'dropoff') = 'pickup' then 'pickup' else 'walkin' end,
      '__',
      coalesce((r.intake_date at time zone 'utc')::date, (r.checked_in_at at time zone 'utc')::date, pr.scheduled_date)::text
    ) as job_key,
    case when coalesce(r.intake_source, 'dropoff') = 'pickup' then 'pickup' else 'walkin' end as source_type,
    pr.client_id,
    coalesce(pr.client_name, fallback_client.name, 'Unknown client') as client_name,
    coalesce(pr.client_address, fallback_client.address) as client_address,
    coalesce((r.intake_date at time zone 'utc')::date, (r.checked_in_at at time zone 'utc')::date, pr.scheduled_date) as scheduled_date,
    case when coalesce(r.intake_source, 'dropoff') = 'pickup' then 'Pickup' else 'Walk-in' end as route_day,
    pr.id as request_id,
    pr.status,
    coalesce(r.checked_in_at, pr.updated_at) as updated_at,
    nullif(btrim(pr.notes), '') as note,
    jsonb_build_object(
      'id', pri.id,
      'pickup_request_id', pri.pickup_request_id,
      'rug_number', pri.rug_number,
      'rug_type', pri.rug_type,
      'length', pri.length,
      'width', pri.width,
      'verified', pri.verified,
      'checked_in_rug_id', pri.checked_in_rug_id,
      'estimate_requested', pri.estimate_requested,
      'estimate_request_details', pri.estimate_request_details,
      'linkedRug', case when r.id is null then null else jsonb_build_object(
        'id', r.id,
        'client_id', r.client_id,
        'tag', r.tag,
        'description', r.description,
        'status', r.status,
        'photo_url', r.photo_url,
        'size_length', r.size_length,
        'size_width', r.size_width,
        'checked_in_at', r.checked_in_at,
        'completed_at', r.completed_at,
        'intake_date', r.intake_date,
        'intake_source', r.intake_source
      ) end,
      'linkedServices', coalesce(to_jsonb(st.linked_services), '[]'::jsonb),
      'linkedServiceTotal', coalesce(st.linked_service_total, 0),
      'latestEstimateResponse', case when er.rug_id is null then null else jsonb_build_object(
        'status', er.status,
        'subject', er.subject,
        'createdAt', er.created_at
      ) end,
      'linkedInvoice', case when il.rug_id is null then null else jsonb_build_object(
        'id', il.id,
        'invoice_number', il.invoice_number,
        'status', il.status,
        'created_at', il.created_at,
        'issued_at', il.issued_at
      ) end,
      'latestReturnState', case
        when re.events is null then null
        else (
          with latest as (
            select re.events->0 as value
          ),
          active as (
            select value
            from jsonb_array_elements(re.events) value
            where value->>'event_type' <> 'rug_return_resolved'
            limit 1
          )
          select jsonb_build_object(
            'kind', case when coalesce((select value->>'event_type' from active), (select value->>'event_type' from latest)) = 'rug_immediate_return_logged' then 'immediate_return' else 'reentry' end,
            'state', case when (select value->>'event_type' from latest) = 'rug_return_resolved' then 'resolved' else 'open' end,
            'createdAt', coalesce((select value->>'created_at' from active), (select value->>'created_at' from latest))
          )
        )
      end,
      'itemSource', coalesce(r.intake_source, 'pickup')
    ) as item_json
  from public.pickup_request_items pri
  join request_scope pr on pr.id = pri.pickup_request_id
  left join rug_scope r on r.id = pri.checked_in_rug_id
  left join public.clients fallback_client on fallback_client.id = r.client_id and fallback_client.id <> pr.client_id
  left join service_totals st on st.rug_id = pri.checked_in_rug_id
  left join estimate_responses er on er.rug_id = pri.checked_in_rug_id
  left join invoice_links il on il.rug_id = pri.checked_in_rug_id
  left join return_events re on re.rug_id = pri.checked_in_rug_id
),
request_linked_rugs as (
  select distinct pri.checked_in_rug_id as rug_id
  from public.pickup_request_items pri
  where pri.checked_in_rug_id is not null
),
walkin_rows as (
  select
    concat(
      r.client_id::text,
      '__',
      case when coalesce(r.intake_source, 'dropoff') = 'pickup' then 'pickup' else 'walkin' end,
      '__',
      coalesce((r.intake_date at time zone 'utc')::date, (r.checked_in_at at time zone 'utc')::date)::text
    ) as job_key,
    case when coalesce(r.intake_source, 'dropoff') = 'pickup' then 'pickup' else 'walkin' end as source_type,
    r.client_id,
    coalesce(c.name, 'Unknown client') as client_name,
    c.address as client_address,
    coalesce((r.intake_date at time zone 'utc')::date, (r.checked_in_at at time zone 'utc')::date) as scheduled_date,
    case when coalesce(r.intake_source, 'dropoff') = 'pickup' then 'Pickup' else 'Walk-in' end as route_day,
    null::uuid as request_id,
    null::public.pickup_request_status as status,
    coalesce(r.checked_in_at, r.completed_at, now()) as updated_at,
    null::text as note,
    jsonb_build_object(
      'id', concat('rug:', r.id::text),
      'pickup_request_id', '',
      'rug_number', r.tag,
      'rug_type', r.description,
      'length', r.size_length,
      'width', r.size_width,
      'verified', true,
      'checked_in_rug_id', r.id,
      'estimate_requested', false,
      'estimate_request_details', null,
      'linkedRug', jsonb_build_object(
        'id', r.id,
        'client_id', r.client_id,
        'tag', r.tag,
        'description', r.description,
        'status', r.status,
        'photo_url', r.photo_url,
        'size_length', r.size_length,
        'size_width', r.size_width,
        'checked_in_at', r.checked_in_at,
        'completed_at', r.completed_at,
        'intake_date', r.intake_date,
        'intake_source', r.intake_source
      ),
      'linkedServices', coalesce(to_jsonb(st.linked_services), '[]'::jsonb),
      'linkedServiceTotal', coalesce(st.linked_service_total, 0),
      'latestEstimateResponse', case when er.rug_id is null then null else jsonb_build_object(
        'status', er.status,
        'subject', er.subject,
        'createdAt', er.created_at
      ) end,
      'linkedInvoice', case when il.rug_id is null then null else jsonb_build_object(
        'id', il.id,
        'invoice_number', il.invoice_number,
        'status', il.status,
        'created_at', il.created_at,
        'issued_at', il.issued_at
      ) end,
      'latestReturnState', case
        when re.events is null then null
        else (
          with latest as (
            select re.events->0 as value
          ),
          active as (
            select value
            from jsonb_array_elements(re.events) value
            where value->>'event_type' <> 'rug_return_resolved'
            limit 1
          )
          select jsonb_build_object(
            'kind', case when coalesce((select value->>'event_type' from active), (select value->>'event_type' from latest)) = 'rug_immediate_return_logged' then 'immediate_return' else 'reentry' end,
            'state', case when (select value->>'event_type' from latest) = 'rug_return_resolved' then 'resolved' else 'open' end,
            'createdAt', coalesce((select value->>'created_at' from active), (select value->>'created_at' from latest))
          )
        )
      end,
      'itemSource', r.intake_source
    ) as item_json
  from rug_scope r
  left join public.clients c on c.id = r.client_id
  left join service_totals st on st.rug_id = r.id
  left join estimate_responses er on er.rug_id = r.id
  left join invoice_links il on il.rug_id = r.id
  left join return_events re on re.rug_id = r.id
  left join request_linked_rugs linked on linked.rug_id = r.id
  where r.client_id is not null
    and linked.rug_id is null
    and coalesce((r.intake_date at time zone 'utc')::date, (r.checked_in_at at time zone 'utc')::date) is not null
),
all_rows as (
  select * from request_item_rows
  union all
  select * from walkin_rows
)
select
  ar.job_key,
  ar.source_type,
  ar.client_id,
  max(ar.client_name) as client_name,
  max(ar.client_address) as client_address,
  ar.scheduled_date,
  max(ar.route_day) as route_day,
  array_remove(array_agg(distinct ar.request_id), null) as request_ids,
  (array_remove(array_agg(ar.request_id order by ar.request_id nulls last), null))[1] as primary_request_id,
  array_remove(array_agg(distinct ar.status), null) as statuses,
  max(ar.updated_at) as updated_at,
  array_remove(array_agg(distinct ar.note), null) as notes,
  jsonb_agg(ar.item_json order by ar.item_json->>'rug_number') as items
from all_rows ar
group by ar.job_key, ar.source_type, ar.client_id, ar.scheduled_date
having count(*) > 0
order by ar.scheduled_date desc, max(ar.updated_at) desc;
$$;

grant execute on function public.get_jobs_summary() to authenticated;
