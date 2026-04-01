begin;

alter table public.message_threads enable row level security;
alter table public.messages enable row level security;
alter table public.notification_cadence enable row level security;
alter table public.notification_throttles enable row level security;

drop policy if exists "Internal users manage message threads" on public.message_threads;
create policy "Internal users manage message threads"
on public.message_threads
for all
using (
  exists (
    select 1
    from public.clients c
    where c.id = message_threads.client_id
      and c.company_id = public.get_user_company_id(auth.uid())
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'office'::public.app_role)
        or public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
      )
  )
)
with check (
  exists (
    select 1
    from public.clients c
    where c.id = message_threads.client_id
      and c.company_id = public.get_user_company_id(auth.uid())
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'office'::public.app_role)
        or public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
      )
  )
);

drop policy if exists "Portal users view own client message threads" on public.message_threads;
create policy "Portal users view own client message threads"
on public.message_threads
for select
using (
  exists (
    select 1
    from public.portal_users pu
    where lower(pu.email) = lower(auth.jwt() ->> 'email')
      and pu.status = 'active'
      and pu.client_id = message_threads.client_id
  )
);

drop policy if exists "Portal users insert own client message threads" on public.message_threads;
create policy "Portal users insert own client message threads"
on public.message_threads
for insert
with check (
  exists (
    select 1
    from public.portal_users pu
    where lower(pu.email) = lower(auth.jwt() ->> 'email')
      and pu.status = 'active'
      and pu.client_id = message_threads.client_id
  )
);

drop policy if exists "Portal users update own client message threads" on public.message_threads;
create policy "Portal users update own client message threads"
on public.message_threads
for update
using (
  exists (
    select 1
    from public.portal_users pu
    where lower(pu.email) = lower(auth.jwt() ->> 'email')
      and pu.status = 'active'
      and pu.client_id = message_threads.client_id
  )
)
with check (
  exists (
    select 1
    from public.portal_users pu
    where lower(pu.email) = lower(auth.jwt() ->> 'email')
      and pu.status = 'active'
      and pu.client_id = message_threads.client_id
  )
);

drop policy if exists "Internal users manage messages" on public.messages;
create policy "Internal users manage messages"
on public.messages
for all
using (
  exists (
    select 1
    from public.message_threads mt
    join public.clients c on c.id = mt.client_id
    where mt.id = messages.thread_id
      and c.company_id = public.get_user_company_id(auth.uid())
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'office'::public.app_role)
        or public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
      )
  )
)
with check (
  exists (
    select 1
    from public.message_threads mt
    join public.clients c on c.id = mt.client_id
    where mt.id = messages.thread_id
      and c.company_id = public.get_user_company_id(auth.uid())
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'office'::public.app_role)
        or public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
      )
  )
);

drop policy if exists "Portal users view own client messages" on public.messages;
create policy "Portal users view own client messages"
on public.messages
for select
using (
  exists (
    select 1
    from public.message_threads mt
    join public.portal_users pu on pu.client_id = mt.client_id
    where mt.id = messages.thread_id
      and lower(pu.email) = lower(auth.jwt() ->> 'email')
      and pu.status = 'active'
  )
);

drop policy if exists "Portal users insert own client messages" on public.messages;
create policy "Portal users insert own client messages"
on public.messages
for insert
with check (
  exists (
    select 1
    from public.message_threads mt
    join public.portal_users pu on pu.client_id = mt.client_id
    where mt.id = messages.thread_id
      and lower(pu.email) = lower(auth.jwt() ->> 'email')
      and pu.status = 'active'
  )
);

drop policy if exists "Internal users manage notification cadence" on public.notification_cadence;
create policy "Internal users manage notification cadence"
on public.notification_cadence
for all
using (
  exists (
    select 1
    from public.clients c
    where c.id = notification_cadence.client_id
      and c.company_id = public.get_user_company_id(auth.uid())
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'office'::public.app_role)
        or public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
      )
  )
)
with check (
  exists (
    select 1
    from public.clients c
    where c.id = notification_cadence.client_id
      and c.company_id = public.get_user_company_id(auth.uid())
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'office'::public.app_role)
        or public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
      )
  )
);

drop policy if exists "Internal users manage notification throttles" on public.notification_throttles;
create policy "Internal users manage notification throttles"
on public.notification_throttles
for all
using (
  exists (
    select 1
    from public.clients c
    where c.id = notification_throttles.client_id
      and c.company_id = public.get_user_company_id(auth.uid())
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'office'::public.app_role)
        or public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
      )
  )
)
with check (
  exists (
    select 1
    from public.clients c
    where c.id = notification_throttles.client_id
      and c.company_id = public.get_user_company_id(auth.uid())
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'office'::public.app_role)
        or public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
      )
  )
);

commit;
