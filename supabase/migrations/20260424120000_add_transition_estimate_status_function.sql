create or replace function public.transition_estimate_status(
  p_estimate_id uuid,
  p_next_status public.estimate_status,
  p_note text default null
)
returns table (
  updated_count integer,
  estimate_id uuid,
  status public.estimate_status,
  approved_at timestamptz,
  rejected_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_is_internal boolean := public.has_role(v_actor_id, 'admin'::public.app_role) or public.has_role(v_actor_id, 'office'::public.app_role);
  v_is_portal boolean := false;
  v_prior_status public.estimate_status;
  v_client_id uuid;
  v_rug_id uuid;
  v_estimate_number text;
  v_client_name text;
  v_client_email text;
  v_now timestamptz := now();
  v_event_type text := null;
  v_event_subject text := null;
  v_event_body text := null;
  v_channel public.communication_channel := 'email'::public.communication_channel;
  v_direction public.communication_direction := 'outbound'::public.communication_direction;
begin
  select
    e.status,
    e.client_id,
    e.rug_id,
    e.estimate_number,
    c.name,
    c.email
  into
    v_prior_status,
    v_client_id,
    v_rug_id,
    v_estimate_number,
    v_client_name,
    v_client_email
  from public.estimates e
  left join public.clients c on c.id = e.client_id
  where e.id = p_estimate_id;

  if v_estimate_number is null then
    raise exception 'Estimate not found';
  end if;

  select exists (
    select 1
    from public.portal_users pu
    where pu.client_id = v_client_id
      and pu.status = 'active'
      and lower(pu.email) = v_actor_email
  ) into v_is_portal;

  if p_next_status = 'needs_office_review' then
    if not v_is_internal then
      raise exception 'Forbidden';
    end if;
    if v_prior_status <> 'needs_revision' then
      raise exception 'Invalid status transition';
    end if;
  elsif p_next_status = 'approved' or p_next_status = 'rejected' then
    if v_prior_status <> 'sent' then
      raise exception 'Invalid status transition';
    end if;
    if not v_is_internal and not v_is_portal then
      raise exception 'Forbidden';
    end if;

    if v_is_portal then
      v_event_type := case when p_next_status = 'approved' then 'estimate_approved_by_client' else 'estimate_rejected_by_client' end;
      v_event_subject := v_estimate_number || ' ' || p_next_status::text;
      v_event_body := case
        when nullif(btrim(coalesce(p_note, '')), '') is not null
          then 'Portal client marked estimate ' || v_estimate_number || ' as ' || p_next_status::text || E'.\n\nClient note: ' || btrim(p_note)
        else 'Portal client marked estimate ' || v_estimate_number || ' as ' || p_next_status::text || '.'
      end;
      v_channel := 'in_app_chat'::public.communication_channel;
      v_direction := 'inbound'::public.communication_direction;
    else
      v_event_type := 'estimate_' || p_next_status::text;
      v_event_subject := v_estimate_number || ' ' || p_next_status::text;
      v_event_body := 'Estimate ' || v_estimate_number || ' for ' || coalesce(v_client_name, 'client') || ' is now ' || p_next_status::text || '.';
    end if;
  else
    raise exception 'Unsupported transition target';
  end if;

  update public.estimates e
  set
    status = p_next_status,
    approved_at = case when p_next_status = 'approved' then v_now else e.approved_at end,
    rejected_at = case when p_next_status = 'rejected' then v_now else e.rejected_at end,
    updated_at = v_now
  where e.id = p_estimate_id;

  if v_event_type is not null then
    insert into public.communication_events (
      client_id,
      rug_id,
      estimate_id,
      channel,
      direction,
      event_type,
      subject,
      body,
      sent_to,
      created_by,
      created_at
    ) values (
      v_client_id,
      v_rug_id,
      p_estimate_id,
      v_channel,
      v_direction,
      v_event_type,
      v_event_subject,
      v_event_body,
      case when v_direction = 'outbound'::public.communication_direction then v_client_email else null end,
      v_actor_id,
      v_now
    );
  end if;

  return query
  select
    1::integer,
    e.id,
    e.status,
    e.approved_at,
    e.rejected_at
  from public.estimates e
  where e.id = p_estimate_id;
end;
$$;

grant execute on function public.transition_estimate_status(uuid, public.estimate_status, text) to authenticated;
