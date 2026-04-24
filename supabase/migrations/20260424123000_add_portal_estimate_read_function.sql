create or replace function public.get_portal_estimates()
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
  items jsonb
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
      r.tag as rug_tag
    from public.estimates e
    join portal_client pc on pc.client_id = e.client_id
    left join public.rugs r on r.id = e.rug_id
    where e.status in ('sent', 'approved', 'rejected')
      or (e.status = 'expired' and e.sent_at is not null)
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
    end as items
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

grant execute on function public.get_portal_estimates() to authenticated;
