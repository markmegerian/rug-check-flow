create or replace function public.ensure_estimate_send_batch_internal(
  p_client_id uuid,
  p_company_id uuid,
  p_scheduled_for timestamptz,
  p_recipient_email text,
  p_subject text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
begin
  if p_client_id is null then
    return null;
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.company_id = public.get_user_company_id(auth.uid())
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'office'::public.app_role)
        or public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
      )
  ) then
    return null;
  end if;

  select id
  into v_batch_id
  from public.estimate_send_batches
  where client_id = p_client_id
    and status = 'queued'
  order by scheduled_for asc, created_at asc
  limit 1;

  if v_batch_id is not null then
    update public.estimate_send_batches
    set
      scheduled_for = least(scheduled_for, p_scheduled_for),
      recipient_email = coalesce(p_recipient_email, recipient_email),
      subject = coalesce(p_subject, subject)
    where id = v_batch_id;

    return v_batch_id;
  end if;

  insert into public.estimate_send_batches (
    client_id,
    company_id,
    scheduled_for,
    status,
    recipient_email,
    subject,
    created_by
  ) values (
    p_client_id,
    p_company_id,
    p_scheduled_for,
    'queued',
    p_recipient_email,
    p_subject,
    auth.uid()
  )
  returning id into v_batch_id;

  return v_batch_id;
end;
$$;

revoke all on function public.ensure_estimate_send_batch_internal(uuid, uuid, timestamptz, text, text) from public;
revoke all on function public.ensure_estimate_send_batch_internal(uuid, uuid, timestamptz, text, text) from anon;
grant execute on function public.ensure_estimate_send_batch_internal(uuid, uuid, timestamptz, text, text) to authenticated;
grant execute on function public.ensure_estimate_send_batch_internal(uuid, uuid, timestamptz, text, text) to service_role;

create or replace function public.ensure_estimate_send_batch(
  p_client_id uuid,
  p_company_id uuid,
  p_scheduled_for timestamptz,
  p_recipient_email text,
  p_subject text default null
)
returns uuid
language sql
security invoker
set search_path = public
as $$
  select public.ensure_estimate_send_batch_internal(
    p_client_id,
    p_company_id,
    p_scheduled_for,
    p_recipient_email,
    p_subject
  );
$$;

grant execute on function public.ensure_estimate_send_batch(uuid, uuid, timestamptz, text, text) to authenticated;
