-- Backfill company ownership on rugs from their linked client when missing.
update public.rugs r
set company_id = c.company_id
from public.clients c
where r.client_id = c.id
  and c.company_id is not null
  and (r.company_id is null or r.company_id <> c.company_id);
