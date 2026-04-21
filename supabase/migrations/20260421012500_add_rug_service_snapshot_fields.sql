alter table public.rug_services
  add column if not exists service_category text,
  add column if not exists service_unit text,
  add column if not exists requires_estimate boolean;

update public.rug_services rs
set
  service_category = s.category,
  service_unit = s.unit,
  requires_estimate = s.requires_estimate
from public.services s
where rs.service_id = s.id
  and (
    rs.service_category is distinct from s.category
    or rs.service_unit is distinct from s.unit
    or rs.requires_estimate is distinct from s.requires_estimate
  );

create index if not exists idx_rug_services_service_category
  on public.rug_services(service_category);
