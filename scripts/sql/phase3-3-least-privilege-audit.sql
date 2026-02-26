-- Phase 3.3 least-privilege audit pack
-- Run in Supabase SQL editor (staging, then production) and attach output to release evidence.

-- 1) SECURITY DEFINER functions in public schema.
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  p.prosecdef as is_security_definer,
  pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef = true
order by 2;

-- 2) Functions executable by anonymous/authenticated/public roles.
select
  r.routine_schema,
  r.routine_name,
  p.grantee,
  p.privilege_type
from information_schema.routines r
join information_schema.role_routine_grants p
  on p.specific_schema = r.specific_schema
 and p.specific_name = r.specific_name
where r.routine_schema = 'public'
  and p.grantee in ('anon', 'authenticated', 'public')
order by r.routine_name, p.grantee;

-- 3) Tables exposed to anon/authenticated with direct grants.
select
  table_schema,
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'public')
group by table_schema, table_name, grantee
order by table_name, grantee;

-- 4) Public tables with RLS disabled.
select
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  forcerowsecurity as force_rls
from pg_tables t
join pg_class c on c.relname = t.tablename
join pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
where t.schemaname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = false
order by tablename;

-- 5) Policies grouped by table to confirm role scoping intent.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  permissive
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
