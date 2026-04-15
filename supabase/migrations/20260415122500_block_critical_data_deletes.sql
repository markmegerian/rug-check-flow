begin;

create or replace function public.prevent_non_service_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Deletes are disabled on critical table %', tg_table_name
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function public.prevent_non_service_delete() from public;
grant execute on function public.prevent_non_service_delete() to authenticated, service_role;

drop policy if exists "estimates_delete_admin_office" on public.estimates;
drop policy if exists "pickup_photos_delete_driver_internal" on public.pickup_photos;
drop policy if exists "Users can delete their own rug photos" on storage.objects;

drop trigger if exists prevent_delete_rugs on public.rugs;
create trigger prevent_delete_rugs
before delete on public.rugs
for each row execute function public.prevent_non_service_delete();

drop trigger if exists prevent_delete_rug_services on public.rug_services;
create trigger prevent_delete_rug_services
before delete on public.rug_services
for each row execute function public.prevent_non_service_delete();

drop trigger if exists prevent_delete_checkin_photos on public.checkin_photos;
create trigger prevent_delete_checkin_photos
before delete on public.checkin_photos
for each row execute function public.prevent_non_service_delete();

drop trigger if exists prevent_delete_pickup_photos on public.pickup_photos;
create trigger prevent_delete_pickup_photos
before delete on public.pickup_photos
for each row execute function public.prevent_non_service_delete();

drop trigger if exists prevent_delete_estimates on public.estimates;
create trigger prevent_delete_estimates
before delete on public.estimates
for each row execute function public.prevent_non_service_delete();

drop trigger if exists prevent_delete_invoices on public.invoices;
create trigger prevent_delete_invoices
before delete on public.invoices
for each row execute function public.prevent_non_service_delete();

drop trigger if exists prevent_delete_message_threads on public.message_threads;
create trigger prevent_delete_message_threads
before delete on public.message_threads
for each row execute function public.prevent_non_service_delete();

drop trigger if exists prevent_delete_messages on public.messages;
create trigger prevent_delete_messages
before delete on public.messages
for each row execute function public.prevent_non_service_delete();

commit;
