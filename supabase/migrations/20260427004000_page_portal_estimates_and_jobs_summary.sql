create or replace function public.get_portal_estimates(
  p_status_scope text default 'all',
  p_page integer default 0,
  p_page_size integer default 10
)
returns table (
  estimate_id uuid,
  estimate_number text,
  status public.estimate_status,
  total numeric,
  created_at timestamptz,
  sent_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  rug_tag text,
  items jsonb,
  total_count bigint
)
language sql
security invoker
set search_path = public
as $$
  with portal_client as (
    select pu.client_id
    from public.portal_users pu
    where pu.status = 'active'
      and lower(pu.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    order by pu.created_at desc
    limit 1
  ),
  visible_estimates as (
    select
      e.id,
      e.estimate_number,
      e.status,
      e.total,
      e.created_at,
      e.sent_at,
      e.approved_at,
      e.rejected_at,
      r.tag as rug_tag,
      count(*) over() as total_count
    from public.estimates e
    join portal_client pc on pc.client_id = e.client_id
    left join public.rugs r on r.id = e.rug_id
    where (
      e.status in ('sent', 'approved', 'rejected')
      or (e.status = 'expired' and e.sent_at is not null)
    )
      and (
        p_status_scope = 'all'
        or (p_status_scope = 'pending' and e.status = 'sent')
        or (p_status_scope = 'history' and e.status <> 'sent')
      )
    order by coalesce(e.sent_at, e.created_at) desc, e.created_at desc
    offset greatest(p_page, 0) * greatest(p_page_size, 1)
    limit greatest(p_page_size, 1)
  )
  select
    ve.id as estimate_id,
    ve.estimate_number,
    ve.status,
    ve.total,
    ve.created_at,
    ve.sent_at,
    ve.approved_at,
    ve.rejected_at,
    ve.rug_tag,
    case
      when ve.status = 'sent' then coalesce(items.items, '[]'::jsonb)
      else '[]'::jsonb
    end as items,
    ve.total_count
  from visible_estimates ve
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', ei.id,
        'estimate_id', ei.estimate_id,
        'rug_service_id', ei.rug_service_id,
        'description', ei.description,
        'quantity', ei.quantity,
        'unit_price', ei.unit_price,
        'total', ei.total,
        'client_approved', ei.client_approved,
        'client_decision_at', ei.client_decision_at,
        'service_category', ei.service_category
      )
      order by ei.created_at asc, ei.id asc
    ) as items
    from public.estimate_items ei
    where ei.estimate_id = ve.id
  ) items on true
  order by coalesce(ve.sent_at, ve.created_at) desc, ve.created_at desc;
$$;

grant execute on function public.get_portal_estimates(text, integer, integer) to authenticated;

create or replace function public.get_jobs_summary(
  p_source_type text default null,
  p_search text default null,
  p_page integer default 0,
  p_page_size integer default 10
)
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
  items jsonb,
  total_count bigint
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
    jsonb_agg(
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
),
job_rows as (
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
),
filtered_rows as (
  select jr.*,
         count(*) over() as total_count
  from job_rows jr
  where (p_source_type is null or jr.source_type = p_source_type)
    and (
      p_search is null
      or btrim(p_search) = ''
      or jr.client_name ilike '%' || btrim(p_search) || '%'
      or jr.route_day ilike '%' || btrim(p_search) || '%'
      or jr.scheduled_date::text ilike '%' || btrim(p_search) || '%'
      or exists (
        select 1
        from jsonb_array_elements(jr.items) item
        where coalesce(item->>'rug_number', '') ilike '%' || btrim(p_search) || '%'
           or coalesce(item->>'rug_type', '') ilike '%' || btrim(p_search) || '%'
           or coalesce(item->'linkedRug'->>'tag', '') ilike '%' || btrim(p_search) || '%'
           or exists (
             select 1
             from jsonb_array_elements_text(coalesce(item->'linkedServices', '[]'::jsonb)) service_name
             where service_name ilike '%' || btrim(p_search) || '%'
           )
      )
    )
)
select
  fr.job_key,
  fr.source_type,
  fr.client_id,
  fr.client_name,
  fr.client_address,
  fr.scheduled_date,
  fr.route_day,
  fr.request_ids,
  fr.primary_request_id,
  fr.statuses,
  fr.updated_at,
  fr.notes,
  fr.items,
  fr.total_count
from filtered_rows fr
order by fr.scheduled_date desc, fr.updated_at desc
offset greatest(p_page, 0) * greatest(p_page_size, 1)
limit greatest(p_page_size, 1);
$$;

grant execute on function public.get_jobs_summary(text, text, integer, integer) to authenticated;
