create or replace function public.ensure_estimate_send_batch(
  p_client_id uuid,
  p_company_id uuid,
  p_scheduled_for timestamptz,
  p_recipient_email text,
  p_subject text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch_id uuid;
begin
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
    subject
  ) values (
    p_client_id,
    p_company_id,
    p_scheduled_for,
    'queued',
    p_recipient_email,
    p_subject
  )
  returning id into v_batch_id;

  return v_batch_id;
end;
$$;

grant execute on function public.ensure_estimate_send_batch(uuid, uuid, timestamptz, text, text) to authenticated;
