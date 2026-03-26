alter table public.clients
  add column if not exists invoice_terms_days integer not null default 14,
  add column if not exists billing_reminder_preference text not null default 'email',
  add column if not exists billing_notes text not null default '';

update public.clients
set invoice_terms_days = coalesce(invoice_terms_days, 14),
    billing_reminder_preference = coalesce(nullif(billing_reminder_preference, ''), 'email'),
    billing_notes = coalesce(billing_notes, '');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_invoice_terms_days_positive'
  ) then
    alter table public.clients
      add constraint clients_invoice_terms_days_positive
      check (invoice_terms_days between 1 and 90);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_billing_reminder_preference_valid'
  ) then
    alter table public.clients
      add constraint clients_billing_reminder_preference_valid
      check (billing_reminder_preference in ('email', 'phone', 'manual'));
  end if;
end $$;
