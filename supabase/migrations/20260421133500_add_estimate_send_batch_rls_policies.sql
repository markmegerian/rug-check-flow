alter table public.estimate_send_batches enable row level security;
alter table public.estimate_send_batch_items enable row level security;

drop policy if exists "Internal users manage estimate send batches" on public.estimate_send_batches;
create policy "Internal users manage estimate send batches"
on public.estimate_send_batches
for all
using (
  exists (
    select 1
    from public.clients c
    where c.id = estimate_send_batches.client_id
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
    where c.id = estimate_send_batches.client_id
      and c.company_id = public.get_user_company_id(auth.uid())
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'office'::public.app_role)
        or public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
      )
  )
);

drop policy if exists "Internal users manage estimate send batch items" on public.estimate_send_batch_items;
create policy "Internal users manage estimate send batch items"
on public.estimate_send_batch_items
for all
using (
  exists (
    select 1
    from public.estimate_send_batches b
    join public.clients c on c.id = b.client_id
    where b.id = estimate_send_batch_items.batch_id
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
    from public.estimate_send_batches b
    join public.clients c on c.id = b.client_id
    where b.id = estimate_send_batch_items.batch_id
      and c.company_id = public.get_user_company_id(auth.uid())
      and (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'office'::public.app_role)
        or public.has_role(auth.uid(), 'checkin_staff'::public.app_role)
      )
  )
);
