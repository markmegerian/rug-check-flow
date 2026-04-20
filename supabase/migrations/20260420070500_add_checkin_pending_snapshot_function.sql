create or replace function public.get_checkin_pending_pickups(p_target_date date)
returns table (
  pickup_request_item_id uuid,
  pickup_request_id uuid,
  client_id uuid,
  client_name text,
  scheduled_date date,
  rug_number text,
  rug_type text,
  length numeric,
  width numeric,
  estimate_requested boolean,
  estimate_request_details text
)
language sql
security invoker
set search_path = public
as $$
  select
    pri.id as pickup_request_item_id,
    pr.id as pickup_request_id,
    pr.client_id,
    c.name as client_name,
    pr.scheduled_date,
    pri.rug_number,
    pri.rug_type,
    pri.length,
    pri.width,
    coalesce(pri.estimate_requested, false) as estimate_requested,
    pri.estimate_request_details
  from public.pickup_request_items pri
  join public.pickup_requests pr on pr.id = pri.pickup_request_id
  join public.clients c on c.id = pr.client_id
  where pr.status = 'completed'
    and pr.scheduled_date = p_target_date
    and pri.checked_in_rug_id is null
  order by c.name asc, pri.rug_number asc, pri.id asc;
$$;

grant execute on function public.get_checkin_pending_pickups(date) to authenticated;
