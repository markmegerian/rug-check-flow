-- Prevent future orphan invoices while tolerating the single historical legacy row
-- that already exists with client_id = null.

create or replace function public.prevent_unlinked_invoices()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.client_id is null then
      raise exception 'Invoices must have client_id on insert'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.client_id is not null and new.client_id is null then
      raise exception 'Invoices cannot clear client_id once set'
        using errcode = '23514';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_unlinked_invoices on public.invoices;
create trigger trg_prevent_unlinked_invoices
before insert or update on public.invoices
for each row
execute function public.prevent_unlinked_invoices();
