-- Add rug_photos table for multi-photo support.
-- Previously only rugs.photo_url (singular) was stored,
-- causing additional photos to be uploaded to storage but lost.

create table if not exists public.rug_photos (
  id uuid primary key default gen_random_uuid(),
  rug_id uuid not null references public.rugs(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_rug_photos_rug_id on public.rug_photos(rug_id);

-- RLS: same access pattern as rugs table
alter table public.rug_photos enable row level security;

create policy "Staff can view rug photos"
  on public.rug_photos for select
  using (true);

create policy "Staff can insert rug photos"
  on public.rug_photos for insert
  with check (true);

create policy "Staff can delete rug photos"
  on public.rug_photos for delete
  using (true);
