create index if not exists idx_messages_thread_created_at
  on public.messages(thread_id, created_at);

create index if not exists idx_message_threads_client_updated_at_desc
  on public.message_threads(client_id, updated_at desc);

create index if not exists idx_delivery_lists_target_date_route_day
  on public.delivery_lists(target_date, route_day);

create index if not exists idx_rugs_client_status
  on public.rugs(client_id, status);

create index if not exists idx_communication_events_rug_created_at_desc
  on public.communication_events(rug_id, created_at desc);

create index if not exists idx_invoice_items_rug_id
  on public.invoice_items(rug_id);

create index if not exists idx_pickup_requests_scheduled_date_desc
  on public.pickup_requests(scheduled_date desc);
