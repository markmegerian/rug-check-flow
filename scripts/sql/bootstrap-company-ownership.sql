-- Company ownership bootstrap (operator-run, environment-specific)
--
-- Purpose:
--   Seed the first real company row + memberships + legacy client assignment in an
--   environment where company scoping exists in schema but production ownership has
--   not been initialized yet.
--
-- Safety model:
--   - Intentionally NOT a migration, because the chosen company name/slug and owner
--     user IDs are environment-specific operational decisions.
--   - Fill in the placeholders below after running:
--       scripts/company-ownership-bootstrap-audit.sh
--   - Run inside a transaction and review the preflight outputs first.
--
-- Usage (example):
--   psql "$SUPABASE_DB_URL" -f scripts/sql/bootstrap-company-ownership.sql
--
-- Required operator edits before execution:
--   1. replace __COMPANY_NAME__
--   2. replace __COMPANY_SLUG__
--   3. replace __PRIMARY_OWNER_USER_ID__
--   4. optionally add more membership rows in selected_members
--
-- Notes:
--   - Assumes current prod is effectively single-company.
--   - Backfills only clients with company_id IS NULL.
--   - Leaves existing non-null client ownership untouched.

begin;

with operator_input as (
  select
    '__COMPANY_NAME__'::text as company_name,
    '__COMPANY_SLUG__'::text as company_slug,
    '__PRIMARY_OWNER_USER_ID__'::uuid as primary_owner_user_id
),
selected_members as (
  select primary_owner_user_id as user_id, 'company_admin'::public.company_role as membership_role
  from operator_input
  -- union all
  -- select '__ANOTHER_USER_ID__'::uuid, 'company_admin'::public.company_role
  -- union all
  -- select '__STAFF_USER_ID__'::uuid, 'staff'::public.company_role
),
validation as (
  select
    oi.company_name,
    oi.company_slug,
    oi.primary_owner_user_id,
    exists (select 1 from public.companies) as companies_already_exist,
    exists (select 1 from public.companies c where c.slug = oi.company_slug) as slug_already_exists,
    exists (select 1 from public.profiles p where p.user_id = oi.primary_owner_user_id) as primary_owner_profile_exists,
    exists (
      select 1
      from public.user_roles ur
      where ur.user_id = oi.primary_owner_user_id
        and ur.role in ('admin', 'office', 'checkin_staff')
    ) as primary_owner_has_internal_role,
    (
      select count(*)
      from selected_members sm
      left join public.profiles p on p.user_id = sm.user_id
      where p.user_id is null
    ) as selected_members_missing_profiles,
    coalesce((
      select bool_or(not exists (
        select 1
        from public.user_roles ur
        where ur.user_id = sm.user_id
          and ur.role in ('admin', 'office', 'checkin_staff')
      ))
      from selected_members sm
    ), false) as selected_member_missing_internal_role
  from operator_input oi
),
assertions as (
  select
    case when company_name like '__%__' then 1 / 0 else 1 end as company_name_check,
    case when company_slug like '__%__' then 1 / 0 else 1 end as company_slug_check,
    case when companies_already_exist then 1 / 0 else 1 end as companies_empty_check,
    case when slug_already_exists then 1 / 0 else 1 end as slug_unique_check,
    case when not primary_owner_profile_exists then 1 / 0 else 1 end as owner_profile_check,
    case when not primary_owner_has_internal_role then 1 / 0 else 1 end as owner_role_check,
    case when selected_members_missing_profiles > 0 then 1 / 0 else 1 end as member_profile_check,
    case when selected_member_missing_internal_role then 1 / 0 else 1 end as member_role_check
  from validation
),
inserted_company as (
  insert into public.companies (
    name,
    slug,
    subscription_status,
    payment_account_connected,
    settings,
    plan_tier,
    billing_status,
    max_staff_users
  )
  select
    company_name,
    company_slug,
    'active',
    false,
    '{}'::jsonb,
    'starter'::public.plan_tier,
    'active'::public.billing_status,
    10
  from operator_input
  returning id, name, slug
),
inserted_branding as (
  insert into public.company_branding (
    company_id,
    business_name,
    business_email
  )
  select
    ic.id,
    coalesce(nullif(p.business_name, ''), ic.name),
    nullif(p.business_email, '')
  from inserted_company ic
  left join operator_input oi on true
  left join public.profiles p on p.user_id = oi.primary_owner_user_id
  on conflict (company_id) do nothing
  returning company_id
),
inserted_memberships as (
  insert into public.company_memberships (
    company_id,
    user_id,
    role,
    invited_by
  )
  select
    ic.id,
    sm.user_id,
    sm.membership_role,
    (select primary_owner_user_id from operator_input)
  from inserted_company ic
  cross join selected_members sm
  on conflict (company_id, user_id) do update
    set role = excluded.role,
        invited_by = excluded.invited_by
  returning company_id, user_id, role
),
backfilled_clients as (
  update public.clients c
     set company_id = ic.id
    from inserted_company ic
   where c.company_id is null
  returning c.id
)
select json_build_object(
  'company', (select row_to_json(ic) from inserted_company ic),
  'memberships_created_or_updated', (select count(*) from inserted_memberships),
  'clients_backfilled_from_null', (select count(*) from backfilled_clients),
  'branding_seeded', exists(select 1 from inserted_branding)
) as bootstrap_summary
from assertions;

commit;
