-- Backfill company ownership on inspections from their linked client where present.
update public.inspections i
set company_id = c.company_id
from public.clients c
where i.client_id = c.id
  and c.company_id is not null
  and (i.company_id is null or i.company_id <> c.company_id);
