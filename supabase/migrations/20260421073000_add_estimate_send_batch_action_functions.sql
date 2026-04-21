create or replace function public.cancel_estimate_send_batch(p_batch_id uuid)
returns table (updated_count integer)
language sql
security invoker
set search_path = public
as $$
  with updated as (
    update public.estimate_send_batches
    set status = 'cancelled'
    where id = p_batch_id
      and status = 'queued'
    returning id
  )
  select count(*)::integer as updated_count from updated;
$$;

create or replace function public.requeue_estimate_send_batch(p_batch_id uuid)
returns table (updated_count integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_client_id uuid;
  v_company_id uuid;
  v_recipient_email text;
  v_subject text;
  v_new_batch_id uuid;
begin
  select client_id, company_id, recipient_email, subject
  into v_client_id, v_company_id, v_recipient_email, v_subject
  from public.estimate_send_batches
  where id = p_batch_id;

  if v_client_id is null then
    return query select 0::integer;
    return;
  end if;

  select public.ensure_estimate_send_batch(
    v_client_id,
    v_company_id,
    now(),
    v_recipient_email,
    v_subject
  ) into v_new_batch_id;

  insert into public.estimate_send_batch_items (batch_id, estimate_id)
  select v_new_batch_id, i.estimate_id
  from public.estimate_send_batch_items i
  where i.batch_id = p_batch_id
  on conflict (batch_id, estimate_id) do nothing;

  return query select 1::integer;
end;
$$;

grant execute on function public.cancel_estimate_send_batch(uuid) to authenticated;
grant execute on function public.requeue_estimate_send_batch(uuid) to authenticated;
