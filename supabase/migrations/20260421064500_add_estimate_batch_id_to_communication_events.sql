alter table public.communication_events
  add column if not exists estimate_batch_id uuid references public.estimate_send_batches(id) on delete set null;

create index if not exists communication_events_estimate_batch_id_idx
  on public.communication_events (estimate_batch_id);
