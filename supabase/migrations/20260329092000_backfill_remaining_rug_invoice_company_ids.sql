update public.rugs r
   set company_id = c.company_id
  from public.clients c
 where r.client_id = c.id
   and r.company_id is null
   and c.company_id is not null;

update public.invoices i
   set company_id = c.company_id
  from public.clients c
 where i.client_id = c.id
   and i.company_id is null
   and c.company_id is not null;
