begin;

delete from public.notification_cadence nc
using (
  select ctid,
         row_number() over (
           partition by client_id, entity_type, entity_id, notification_type
           order by ctid desc
         ) as rn
    from public.notification_cadence
) ranked
where nc.ctid = ranked.ctid
  and ranked.rn > 1;

delete from public.notification_throttles nt
using (
  select ctid,
         row_number() over (
           partition by client_id, throttle_key
           order by ctid desc
         ) as rn
    from public.notification_throttles
) ranked
where nt.ctid = ranked.ctid
  and ranked.rn > 1;

update public.message_threads mt
   set status = 'archived'
  from (
    select id,
           row_number() over (
             partition by client_id, thread_type, coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
             order by id desc
           ) as rn
      from public.message_threads
     where status = 'active'
  ) ranked
 where mt.id = ranked.id
   and ranked.rn > 1;

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
