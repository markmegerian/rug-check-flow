create table if not exists public.checkin_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  workflow_mode text not null default 'create',
  status text not null default 'processing',
  response_payload jsonb,
  rug_id uuid null references public.rugs(id) on delete set null,
  intake_job_id uuid null references public.intake_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz null,
  constraint checkin_idempotency_keys_actor_key_key unique (actor_user_id, idempotency_key),
  constraint checkin_idempotency_keys_status_check check (status in ('processing', 'completed')),
  constraint checkin_idempotency_keys_mode_check check (workflow_mode in ('create', 'edit'))
);

create index if not exists idx_checkin_idempotency_keys_actor_created_at
  on public.checkin_idempotency_keys (actor_user_id, created_at desc);

create or replace function public.touch_checkin_idempotency_keys_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

DROP TRIGGER IF EXISTS trg_touch_checkin_idempotency_keys_updated_at ON public.checkin_idempotency_keys;
create trigger trg_touch_checkin_idempotency_keys_updated_at
before update on public.checkin_idempotency_keys
for each row
execute function public.touch_checkin_idempotency_keys_updated_at();

grant all on table public.checkin_idempotency_keys to service_role;
grant select, insert, update, delete on table public.checkin_idempotency_keys to authenticated;
