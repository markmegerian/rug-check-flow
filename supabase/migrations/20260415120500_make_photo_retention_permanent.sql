begin;

update public.checkin_photos
   set retention_policy = 'permanent',
       expires_at = null
 where retention_policy is distinct from 'permanent'
    or expires_at is not null;

alter table public.checkin_photos
  alter column retention_policy set default 'permanent';

update public.pickup_photos
   set retention_policy = 'permanent',
       expires_at = null
 where retention_policy is distinct from 'permanent'
    or expires_at is not null;

alter table public.pickup_photos
  alter column retention_policy set default 'permanent';

commit;
