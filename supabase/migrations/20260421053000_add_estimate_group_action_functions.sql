create or replace function public.mark_estimate_group_ready(p_estimate_ids uuid[])
returns table (updated_count bigint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  update public.estimates e
  set status = 'ready_to_send',
      updated_at = v_now
  where e.id = any(p_estimate_ids)
    and e.status = 'needs_office_review';

  insert into public.communication_events (
    client_id,
    rug_id,
    estimate_id,
    channel,
    direction,
    subject,
    body,
    sent_to,
    event_type,
    created_by,
    created_at
  )
  select
    e.client_id,
    e.rug_id,
    e.id,
    'email'::public.communication_channel,
    'outbound'::public.communication_direction,
    e.estimate_number || ' ready to send',
    'Estimate ' || e.estimate_number || ' for ' || coalesce(c.name, 'client') || ' is ready to send.',
    c.email,
    'estimate_ready_to_send',
    auth.uid(),
    v_now
  from public.estimates e
  left join public.clients c on c.id = e.client_id
  where e.id = any(p_estimate_ids)
    and e.status = 'ready_to_send'
    and not exists (
      select 1
      from public.communication_events ce
      where ce.estimate_id = e.id
        and ce.event_type = 'estimate_ready_to_send'
        and ce.created_at >= v_now - interval '1 minute'
    );

  return query
  select count(*)::bigint
  from public.estimates e
  where e.id = any(p_estimate_ids)
    and e.status = 'ready_to_send';
end;
$$;

grant execute on function public.mark_estimate_group_ready(uuid[]) to authenticated;

create or replace function public.expire_estimate_group(p_estimate_ids uuid[])
returns table (updated_count bigint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  update public.estimates e
  set status = 'expired',
      updated_at = v_now
  where e.id = any(p_estimate_ids)
    and e.status = any(array['needs_office_review', 'ready_to_send', 'sent', 'needs_revision']::public.estimate_status[]);

  insert into public.communication_events (
    client_id,
    rug_id,
    estimate_id,
    channel,
    direction,
    subject,
    body,
    sent_to,
    event_type,
    created_by,
    created_at
  )
  select
    e.client_id,
    e.rug_id,
    e.id,
    'email'::public.communication_channel,
    'outbound'::public.communication_direction,
    e.estimate_number || ' expired',
    'Estimate ' || e.estimate_number || ' for ' || coalesce(c.name, 'client') || ' was marked expired on ' || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') || ' UTC.',
    c.email,
    'estimate_expired',
    auth.uid(),
    v_now
  from public.estimates e
  left join public.clients c on c.id = e.client_id
  where e.id = any(p_estimate_ids)
    and e.status = 'expired'
    and not exists (
      select 1
      from public.communication_events ce
      where ce.estimate_id = e.id
        and ce.event_type = 'estimate_expired'
        and ce.created_at >= v_now - interval '1 minute'
    );

  return query
  select count(*)::bigint
  from public.estimates e
  where e.id = any(p_estimate_ids)
    and e.status = 'expired';
end;
$$;

grant execute on function public.expire_estimate_group(uuid[]) to authenticated;
