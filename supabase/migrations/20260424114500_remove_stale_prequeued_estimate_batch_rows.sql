delete from public.notification_cadence nc
using public.estimates e
where nc.entity_type = 'estimate'
  and nc.notification_type = 'estimate_batch_send'
  and nc.sent_at is null
  and e.id = nc.entity_id
  and e.status <> 'ready_to_send';
