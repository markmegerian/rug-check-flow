-- Backfill company ownership on older portal/account records so the app stops relying
-- on implicit legacy fallback behavior for these account-access paths.

update public.portal_users pu
set company_id = c.company_id
from public.clients c
where pu.client_id = c.id
  and c.company_id is not null
  and (pu.company_id is null or pu.company_id <> c.company_id);

update public.client_accounts ca
set company_id = c.company_id
from public.clients c
where ca.client_id = c.id
  and c.company_id is not null
  and (ca.company_id is null or ca.company_id <> c.company_id);

update public.client_job_access cja
set company_id = j.company_id
from public.jobs j
where cja.job_id = j.id
  and j.company_id is not null
  and (cja.company_id is null or cja.company_id <> j.company_id);
