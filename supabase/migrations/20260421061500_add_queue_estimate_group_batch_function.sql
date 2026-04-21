create or replace function public.queue_estimate_group_batch(p_estimate_ids uuid[])
returns table (queued_count integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_scheduled_for timestamptz;
begin
  if coalesce(array_length(p_estimate_ids, 1), 0) = 0 then
    return query select 0::integer;
    return;
  end if;

  select timezone('UTC', public.compute_next_daily_anchor_in_eastern(15, 0, v_now)) into v_scheduled_for;

  insert into public.notification_cadence (
    client_id,
    entity_type,
    entity_id,
    notification_type,
    scheduled_for,
    throttle_key
  )
  select
    e.client_id,
    'estimate',
    e.id,
    'estimate_batch_send',
    v_scheduled_for,
    'estimate-batch:' || e.client_id::text
  from public.estimates e
  where e.id = any(p_estimate_ids)
    and e.status = 'ready_to_send'
    and e.client_id is not null
  on conflict (client_id, entity_type, entity_id, notification_type)
  do update set
    scheduled_for = excluded.scheduled_for,
    throttle_key = excluded.throttle_key,
    sent_at = null;

  return query
  select count(*)::integer
  from public.estimates e
  where e.id = any(p_estimate_ids)
    and e.status = 'ready_to_send'
    and e.client_id is not null;
end;
$$;

grant execute on function public.queue_estimate_group_batch(uuid[]) to authenticated;
