begin;

create unique index if not exists notification_cadence_identity_idx
  on public.notification_cadence (client_id, entity_type, entity_id, notification_type);

create unique index if not exists notification_throttles_identity_idx
  on public.notification_throttles (client_id, throttle_key);

create unique index if not exists message_threads_active_identity_idx
  on public.message_threads (
    client_id,
    thread_type,
    coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'active';

commit;
