create table if not exists public.estimate_send_batches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  company_id uuid null references public.companies(id) on delete set null,
  scheduled_for timestamptz not null,
  sent_at timestamptz null,
  status text not null default 'queued',
  recipient_email text null,
  subject text null,
  body text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint estimate_send_batches_status_check check (status in ('queued', 'sent', 'failed', 'cancelled'))
);

create table if not exists public.estimate_send_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.estimate_send_batches(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (batch_id, estimate_id)
);

create index if not exists estimate_send_batches_client_scheduled_idx
  on public.estimate_send_batches (client_id, scheduled_for desc);

create index if not exists estimate_send_batches_status_scheduled_idx
  on public.estimate_send_batches (status, scheduled_for asc);

create index if not exists estimate_send_batch_items_estimate_idx
  on public.estimate_send_batch_items (estimate_id);

create or replace function public.set_estimate_send_batches_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists estimate_send_batches_set_updated_at on public.estimate_send_batches;
create trigger estimate_send_batches_set_updated_at
before update on public.estimate_send_batches
for each row
execute function public.set_estimate_send_batches_updated_at();

grant all on table public.estimate_send_batches to authenticated;
grant all on table public.estimate_send_batch_items to authenticated;
