


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'staff',
    'client',
    'admin',
    'office',
    'checkin_staff',
    'driver'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."billing_status" AS ENUM (
    'trialing',
    'active',
    'past_due',
    'canceled'
);


ALTER TYPE "public"."billing_status" OWNER TO "postgres";


CREATE TYPE "public"."communication_channel" AS ENUM (
    'email',
    'in_app_chat'
);


ALTER TYPE "public"."communication_channel" OWNER TO "postgres";


CREATE TYPE "public"."communication_direction" AS ENUM (
    'outbound',
    'inbound'
);


ALTER TYPE "public"."communication_direction" OWNER TO "postgres";


CREATE TYPE "public"."company_role" AS ENUM (
    'company_admin',
    'staff'
);


ALTER TYPE "public"."company_role" OWNER TO "postgres";


CREATE TYPE "public"."delivery_list_status" AS ENUM (
    'compiling',
    'confirmed',
    'checked_out'
);


ALTER TYPE "public"."delivery_list_status" OWNER TO "postgres";


CREATE TYPE "public"."estimate_status" AS ENUM (
    'draft',
    'sent',
    'approved',
    'rejected',
    'expired'
);


ALTER TYPE "public"."estimate_status" OWNER TO "postgres";


CREATE TYPE "public"."invoice_status" AS ENUM (
    'draft',
    'sent',
    'paid',
    'overdue'
);


ALTER TYPE "public"."invoice_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_attempt_status" AS ENUM (
    'pending',
    'succeeded',
    'failed'
);


ALTER TYPE "public"."payment_attempt_status" OWNER TO "postgres";


CREATE TYPE "public"."pickup_request_status" AS ENUM (
    'pending',
    'confirmed',
    'assigned',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."pickup_request_status" OWNER TO "postgres";


CREATE TYPE "public"."plan_tier" AS ENUM (
    'starter',
    'pro',
    'enterprise'
);


ALTER TYPE "public"."plan_tier" OWNER TO "postgres";


CREATE TYPE "public"."pricing_tier" AS ENUM (
    'standard',
    'preferred',
    'vip'
);


ALTER TYPE "public"."pricing_tier" OWNER TO "postgres";


CREATE TYPE "public"."rug_status" AS ENUM (
    'checked_in',
    'in_production',
    'ready',
    'picked_up'
);


ALTER TYPE "public"."rug_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_identifier" "text", "p_action" "text", "p_max_requests" integer DEFAULT 10, "p_window_minutes" integer DEFAULT 60) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  request_count integer;
BEGIN
  -- Clean up old entries for this action
  DELETE FROM rate_limits
  WHERE action = p_action
    AND created_at < now() - (p_window_minutes || ' minutes')::interval;

  -- Count recent requests
  SELECT count(*) INTO request_count
  FROM rate_limits
  WHERE identifier = p_identifier
    AND action = p_action
    AND created_at > now() - (p_window_minutes || ' minutes')::interval;

  -- Check if over limit
  IF request_count >= p_max_requests THEN
    RETURN false;
  END IF;

  -- Record this request
  INSERT INTO rate_limits (identifier, action)
  VALUES (p_identifier, p_action);

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."check_rate_limit"("p_identifier" "text", "p_action" "text", "p_max_requests" integer, "p_window_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_token_rate_limit"("_identifier" "text", "_max_attempts" integer DEFAULT 10, "_window_seconds" integer DEFAULT 300, "_block_seconds" integer DEFAULT 900) RETURNS TABLE("allowed" boolean, "remaining_attempts" integer, "blocked_until_ts" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _record token_validation_attempts%ROWTYPE;
  _now timestamp with time zone := now();
  _window_start timestamp with time zone := _now - (_window_seconds || ' seconds')::interval;
BEGIN
  -- Get or create the rate limit record
  SELECT * INTO _record FROM token_validation_attempts 
  WHERE identifier = _identifier FOR UPDATE;
  
  IF NOT FOUND THEN
    -- First attempt
    INSERT INTO token_validation_attempts (identifier, attempt_count, first_attempt_at, last_attempt_at)
    VALUES (_identifier, 1, _now, _now);
    RETURN QUERY SELECT true, _max_attempts - 1, NULL::timestamp with time zone;
    RETURN;
  END IF;
  
  -- Check if currently blocked
  IF _record.blocked_until IS NOT NULL AND _record.blocked_until > _now THEN
    RETURN QUERY SELECT false, 0, _record.blocked_until;
    RETURN;
  END IF;
  
  -- Reset if outside window
  IF _record.first_attempt_at < _window_start THEN
    UPDATE token_validation_attempts 
    SET attempt_count = 1, first_attempt_at = _now, last_attempt_at = _now, blocked_until = NULL
    WHERE identifier = _identifier;
    RETURN QUERY SELECT true, _max_attempts - 1, NULL::timestamp with time zone;
    RETURN;
  END IF;
  
  -- Increment attempt
  IF _record.attempt_count >= _max_attempts THEN
    -- Block the identifier
    UPDATE token_validation_attempts 
    SET blocked_until = _now + (_block_seconds || ' seconds')::interval, last_attempt_at = _now
    WHERE identifier = _identifier;
    RETURN QUERY SELECT false, 0, _now + (_block_seconds || ' seconds')::interval;
    RETURN;
  END IF;
  
  -- Allow but increment
  UPDATE token_validation_attempts 
  SET attempt_count = attempt_count + 1, last_attempt_at = _now
  WHERE identifier = _identifier;
  RETURN QUERY SELECT true, _max_attempts - _record.attempt_count - 1, NULL::timestamp with time zone;
END;
$$;


ALTER FUNCTION "public"."check_token_rate_limit"("_identifier" "text", "_max_attempts" integer, "_window_seconds" integer, "_block_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_rate_limits"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM token_validation_attempts 
  WHERE last_attempt_at < now() - interval '1 day'
  AND (blocked_until IS NULL OR blocked_until < now());
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_rate_limits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."client_has_job_access"("check_job_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM client_job_access cja
    JOIN client_accounts ca ON ca.id = cja.client_id
    WHERE cja.job_id = check_job_id
    AND ca.user_id = (select auth.uid())
  );
$$;


ALTER FUNCTION "public"."client_has_job_access"("check_job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."company_can_create_jobs"("_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = _company_id
    AND billing_status IN ('trialing', 'active')
  )
$$;


ALTER FUNCTION "public"."company_can_create_jobs"("_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."company_has_feature"("_company_id" "uuid", "_feature" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _plan plan_tier;
BEGIN
  SELECT plan_tier INTO _plan FROM public.companies WHERE id = _company_id;
  
  IF _plan IS NULL THEN
    RETURN false;
  END IF;
  
  -- Feature access by plan
  CASE _feature
    -- Starter: basic features only
    WHEN 'advanced_pricing_multipliers' THEN
      RETURN _plan IN ('pro', 'enterprise');
    WHEN 'white_label_branding' THEN
      RETURN _plan = 'enterprise';
    WHEN 'analytics_dashboard' THEN
      RETURN _plan IN ('pro', 'enterprise');
    WHEN 'custom_email_templates' THEN
      RETURN _plan IN ('pro', 'enterprise');
    WHEN 'api_access' THEN
      RETURN _plan = 'enterprise';
    WHEN 'priority_support' THEN
      RETURN _plan = 'enterprise';
    ELSE
      -- Unknown features default to allowed (basic features)
      RETURN true;
  END CASE;
END;
$$;


ALTER FUNCTION "public"."company_has_feature"("_company_id" "uuid", "_feature" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."company_max_staff"("_company_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    CASE plan_tier
      WHEN 'starter' THEN 2
      WHEN 'pro' THEN 10
      WHEN 'enterprise' THEN 999
      ELSE 2
    END
  FROM public.companies
  WHERE id = _company_id
$$;


ALTER FUNCTION "public"."company_max_staff"("_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_company_id"("_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT company_id FROM public.company_memberships
  WHERE user_id = _user_id
  LIMIT 1
$$;


ALTER FUNCTION "public"."get_user_company_id"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_company_role"("_user_id" "uuid") RETURNS "public"."company_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.company_memberships
  WHERE user_id = _user_id
  LIMIT 1
$$;


ALTER FUNCTION "public"."get_user_company_role"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (new.id, new.raw_user_meta_data ->> 'full_name');
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Insert staff role for the new user (for company creation flow)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'staff')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_company_admin"("_user_id" "uuid", "_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_memberships
    WHERE user_id = _user_id 
      AND company_id = _company_id
      AND role = 'company_admin'
  )
$$;


ALTER FUNCTION "public"."is_company_admin"("_user_id" "uuid", "_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_super_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$ select lower(coalesce(auth.jwt() ->> 'email', '')) = 'markmegerian@gmail.com'; $$;


ALTER FUNCTION "public"."is_super_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_portal_onboarding_complete"() RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.portal_users
  SET onboarding_completed_at = COALESCE(onboarding_completed_at, now())
  WHERE lower(email) = lower(auth.jwt() ->> 'email')
    AND status = 'active';

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."mark_portal_onboarding_complete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_audit_log_changes"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted';
END;
$$;


ALTER FUNCTION "public"."prevent_audit_log_changes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_conflicting_roles"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.role = 'staff' THEN
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'client') THEN
      RAISE EXCEPTION 'Cannot assign staff role to a user who already has the client role';
    END IF;
  ELSIF NEW.role = 'client' THEN
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'staff') THEN
      RAISE EXCEPTION 'Cannot assign client role to a user who already has the staff role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_conflicting_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_client_funnel_event"("_access_token" "text", "_event_type" "text", "_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _cja RECORD;
BEGIN
  SELECT job_id, company_id INTO _cja
  FROM public.client_job_access
  WHERE access_token = _access_token AND consumed_at IS NULL
  LIMIT 1;
  IF _cja.job_id IS NULL THEN
    RETURN; -- Token invalid or consumed, silently skip
  END IF;
  INSERT INTO public.funnel_events (event_type, job_id, company_id, actor, payload)
  VALUES (_event_type, _cja.job_id, _cja.company_id, 'client', _payload);
END;
$$;


ALTER FUNCTION "public"."record_client_funnel_event"("_access_token" "text", "_event_type" "text", "_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_token_rate_limit"("_identifier" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  DELETE FROM token_validation_attempts WHERE identifier = _identifier;
$$;


ALTER FUNCTION "public"."reset_token_rate_limit"("_identifier" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_client_access_company_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- If company_id not set, derive from job
  IF NEW.company_id IS NULL AND NEW.job_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.jobs WHERE id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_client_access_company_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_inspection_company_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.company_id IS NULL AND NEW.job_id IS NOT NULL THEN
    SELECT company_id INTO NEW.company_id FROM jobs WHERE id = NEW.job_id;
  END IF;
  IF NEW.company_id IS NULL THEN
    NEW.company_id := get_user_company_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_inspection_company_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_job_company_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := get_user_company_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_job_company_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_client_access_tracking"("_access_token" "text", "_first_accessed" boolean DEFAULT false, "_password_set" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF _first_accessed THEN
    UPDATE client_job_access
    SET first_accessed_at = COALESCE(first_accessed_at, NOW())
    WHERE access_token = _access_token;
  END IF;
  
  IF _password_set THEN
    UPDATE client_job_access
    SET password_set_at = NOW()
    WHERE access_token = _access_token;
  END IF;
END;
$$;


ALTER FUNCTION "public"."update_client_access_tracking"("_access_token" "text", "_first_accessed" boolean, "_password_set" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_enabled_services_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_enabled_services_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_job_last_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.jobs 
  SET last_activity_at = now()
  WHERE id = (
    SELECT ae.job_id FROM approved_estimates ae 
    WHERE ae.id = NEW.approved_estimate_id
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_job_last_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_belongs_to_company"("_user_id" "uuid", "_company_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_memberships
    WHERE user_id = _user_id AND company_id = _company_id
  )
$$;


ALTER FUNCTION "public"."user_belongs_to_company"("_user_id" "uuid", "_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_access_token"("_token" "text") RETURNS TABLE("access_id" "uuid", "job_id" "uuid", "invited_email" "text", "client_id" "uuid", "staff_user_id" "uuid", "job_number" "text", "client_name" "text", "job_status" "text", "auth_user_id" "uuid", "company_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  _token_hash text;
BEGIN
  _token_hash := encode(sha256(_token::bytea), 'hex');

  RETURN QUERY
  SELECT
    cja.id as access_id,
    cja.job_id,
    cja.invited_email,
    cja.client_id,
    j.user_id as staff_user_id,
    j.job_number,
    j.client_name,
    j.status as job_status,
    cja.auth_user_id,
    COALESCE(cja.company_id, j.company_id) as company_id
  FROM client_job_access cja
  JOIN jobs j ON j.id = cja.job_id
  WHERE (
    cja.access_token_hash = _token_hash
    OR (cja.access_token_hash IS NULL AND cja.access_token = _token)
  )
    AND (cja.expires_at IS NULL OR cja.expires_at > NOW());
END;
$$;


ALTER FUNCTION "public"."validate_access_token"("_token" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company_id" "uuid"
);


ALTER TABLE "public"."admin_audit_logs" OWNER TO "postgres";


COMMENT ON TABLE "public"."admin_audit_logs" IS 'Tracks all admin actions for audit purposes';



CREATE TABLE IF NOT EXISTS "public"."ai_analysis_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "inspection_id" "uuid",
    "feedback_type" "text" NOT NULL,
    "original_service_name" "text",
    "original_price" numeric,
    "original_rug_identification" "text",
    "corrected_service_name" "text",
    "corrected_price" numeric,
    "corrected_identification" "text",
    "notes" "text",
    "rug_type" "text",
    "rug_origin" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_analysis_feedback_feedback_type_check" CHECK (("feedback_type" = ANY (ARRAY['service_correction'::"text", 'price_correction'::"text", 'missed_issue'::"text", 'false_positive'::"text", 'identification_error'::"text"])))
);


ALTER TABLE "public"."ai_analysis_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_batch_training_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_label" "text" DEFAULT ('Batch '::"text" || "to_char"("now"(), 'YYYY-MM-DD HH24:MI'::"text")) NOT NULL,
    "photo_path" "text" NOT NULL,
    "rug_type" "text" DEFAULT 'Unknown'::"text" NOT NULL,
    "analysis_result" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "corrections_applied" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_batch_training_items_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'analyzing'::"text", 'analyzed'::"text", 'reviewed'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."ai_batch_training_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approved_estimates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "job_id" "uuid" NOT NULL,
    "services" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "approved_by_staff_at" timestamp with time zone,
    "approved_by_staff_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."approved_estimates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "user_name" "text" DEFAULT 'System'::"text" NOT NULL,
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkin_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "job_id" "uuid",
    "rug_id" "uuid",
    "storage_path" "text" NOT NULL,
    "retention_policy" "text" DEFAULT 'checkin_long_term'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."checkin_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "company_id" "uuid"
);


ALTER TABLE "public"."client_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_job_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "job_id" "uuid" NOT NULL,
    "access_token" "text" NOT NULL,
    "invited_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone,
    "email_sent_at" timestamp with time zone,
    "email_error" "text",
    "first_accessed_at" timestamp with time zone,
    "password_set_at" timestamp with time zone,
    "consumed_at" timestamp with time zone,
    "company_id" "uuid",
    "auth_user_id" "uuid",
    "access_token_hash" "text"
);


ALTER TABLE "public"."client_job_access" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_service_selections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_job_access_id" "uuid" NOT NULL,
    "approved_estimate_id" "uuid" NOT NULL,
    "selected_services" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "total_selected" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."client_service_selections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "pricing_tier" "public"."pricing_tier" DEFAULT 'standard'::"public"."pricing_tier" NOT NULL,
    "route_day" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."communication_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "rug_id" "uuid",
    "estimate_id" "uuid",
    "invoice_id" "uuid",
    "channel" "public"."communication_channel" DEFAULT 'email'::"public"."communication_channel" NOT NULL,
    "direction" "public"."communication_direction" DEFAULT 'outbound'::"public"."communication_direction" NOT NULL,
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "sent_to" "text",
    "event_type" "text" DEFAULT 'general'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."communication_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "subscription_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "payment_account_connected" boolean DEFAULT false NOT NULL,
    "stripe_account_id" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plan_tier" "public"."plan_tier" DEFAULT 'starter'::"public"."plan_tier" NOT NULL,
    "billing_status" "public"."billing_status" DEFAULT 'trialing'::"public"."billing_status" NOT NULL,
    "trial_ends_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval),
    "max_staff_users" integer DEFAULT 2 NOT NULL
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_branding" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "business_name" "text",
    "business_email" "text",
    "business_phone" "text",
    "business_address" "text",
    "logo_path" "text",
    "logo_url" "text",
    "primary_color" "text" DEFAULT '#3b82f6'::"text",
    "secondary_color" "text" DEFAULT '#1e40af'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_branding" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_enabled_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "service_name" "text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_enabled_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."company_role" DEFAULT 'staff'::"public"."company_role" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_service_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "service_name" "text" NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_additional" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_service_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."declined_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "inspection_id" "uuid" NOT NULL,
    "service_id" "text" NOT NULL,
    "service_name" "text" NOT NULL,
    "service_category" "text" NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "declined_amount" numeric DEFAULT 0 NOT NULL,
    "decline_consequence" "text",
    "acknowledged_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "acknowledged_by_client_id" "uuid",
    "restored_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."declined_services" OWNER TO "postgres";


COMMENT ON TABLE "public"."declined_services" IS 'Tracks all services declined by clients with acknowledgement timestamps for audit';



CREATE TABLE IF NOT EXISTS "public"."delivery_list_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "delivery_list_id" "uuid" NOT NULL,
    "rug_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "confirmed_for_delivery" boolean DEFAULT false NOT NULL,
    "loaded_on_truck" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."delivery_list_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "route_day" "text" DEFAULT ''::"text" NOT NULL,
    "target_date" "date" NOT NULL,
    "status" "public"."delivery_list_status" DEFAULT 'compiling'::"public"."delivery_list_status" NOT NULL,
    "compiled_by" "uuid",
    "confirmed_at" timestamp with time zone,
    "checked_out_by" "uuid",
    "checked_out_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."delivery_lists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "template_type" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company_id" "uuid"
);


ALTER TABLE "public"."email_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."estimate_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "estimate_id" "uuid" NOT NULL,
    "rug_service_id" "uuid",
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."estimate_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."estimates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rug_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "estimate_number" "text" NOT NULL,
    "status" "public"."estimate_status" DEFAULT 'draft'::"public"."estimate_status" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "sent_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."estimates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."funnel_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "job_id" "uuid",
    "company_id" "uuid",
    "actor" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "funnel_events_actor_check" CHECK (("actor" = ANY (ARRAY['staff'::"text", 'client'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."funnel_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."funnel_events" IS 'Phase 0: Funnel event tracking for intake, analysis, estimate, payment metrics';



CREATE TABLE IF NOT EXISTS "public"."inspections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_name" "text",
    "client_email" "text",
    "client_phone" "text",
    "rug_number" "text" NOT NULL,
    "rug_type" "text" NOT NULL,
    "length" numeric,
    "width" numeric,
    "notes" "text",
    "photo_urls" "text"[] DEFAULT '{}'::"text"[],
    "analysis_report" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "job_id" "uuid",
    "image_annotations" "jsonb",
    "estimate_approved" boolean DEFAULT false,
    "condition_flags" "jsonb" DEFAULT '{}'::"jsonb",
    "system_services" "jsonb" DEFAULT '[]'::"jsonb",
    "company_id" "uuid",
    "structured_findings" "jsonb"
);


ALTER TABLE "public"."inspections" OWNER TO "postgres";


COMMENT ON COLUMN "public"."inspections"."condition_flags" IS 'Structured condition data from inspection (material, severity flags)';



COMMENT ON COLUMN "public"."inspections"."system_services" IS 'Auto-determined services based on condition flags';



COMMENT ON COLUMN "public"."inspections"."structured_findings" IS 'Structured AI output for rug profile, damages, recommended services, totals, and review flags.';



CREATE TABLE IF NOT EXISTS "public"."intake_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_code" "text" NOT NULL,
    "client_id" "uuid",
    "source" "text" NOT NULL,
    "intake_date" timestamp with time zone NOT NULL,
    "checkin_date" timestamp with time zone NOT NULL,
    "pickup_scheduled_date" "date",
    "pickup_request_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "intake_jobs_source_check" CHECK (("source" = ANY (ARRAY['pickup'::"text", 'dropoff'::"text"])))
);


ALTER TABLE "public"."intake_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."interactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid",
    "job_id" "uuid",
    "rug_id" "uuid",
    "pickup_request_id" "uuid",
    "interaction_type" "text" NOT NULL,
    "channel" "text" DEFAULT 'phone'::"text" NOT NULL,
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."interactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "rug_id" "uuid",
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "quantity" numeric DEFAULT 1 NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoice_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "client_id" "uuid",
    "delivery_list_id" "uuid",
    "status" "public"."invoice_status" DEFAULT 'draft'::"public"."invoice_status" NOT NULL,
    "total" numeric DEFAULT 0 NOT NULL,
    "issued_at" timestamp with time zone,
    "due_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "pdf_storage_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "job_number" "text" NOT NULL,
    "client_name" "text" NOT NULL,
    "client_email" "text",
    "client_phone" "text",
    "notes" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "client_portal_enabled" boolean DEFAULT false,
    "all_estimates_approved" boolean DEFAULT false,
    "client_approved_at" timestamp with time zone,
    "payment_status" "text" DEFAULT 'pending'::"text",
    "last_activity_at" timestamp with time zone DEFAULT "now"(),
    "next_follow_up_at" timestamp with time zone,
    "follow_up_notes" "text",
    "company_id" "uuid"
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "provider" "text" DEFAULT 'stripe'::"text" NOT NULL,
    "provider_payment_ref" "text",
    "amount" numeric DEFAULT 0 NOT NULL,
    "status" "public"."payment_attempt_status" DEFAULT 'pending'::"public"."payment_attempt_status" NOT NULL,
    "attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."payment_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "stripe_payment_intent_id" "text",
    "stripe_checkout_session_id" "text",
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'usd'::"text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "paid_at" timestamp with time zone,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "platform_fee" numeric DEFAULT 0
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "payment_method" "text",
    "reference_number" "text",
    "notes" "text",
    "period_start" "date",
    "period_end" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "paid_at" timestamp with time zone,
    "created_by" "uuid",
    "gross_revenue" numeric DEFAULT 0,
    "platform_fees_deducted" numeric DEFAULT 0,
    "company_id" "uuid"
);


ALTER TABLE "public"."payouts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pickup_photos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pickup_request_id" "uuid",
    "pickup_item_id" "uuid",
    "client_id" "uuid",
    "storage_path" "text" NOT NULL,
    "retention_policy" "text" DEFAULT 'pickup_short_term'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pickup_photos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pickup_request_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pickup_request_id" "uuid" NOT NULL,
    "rug_id" "uuid",
    "rug_number" "text" NOT NULL,
    "rug_type" "text" DEFAULT ''::"text" NOT NULL,
    "length" numeric,
    "width" numeric,
    "is_new" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verified" boolean DEFAULT false NOT NULL,
    "driver_notes" "text" DEFAULT ''::"text" NOT NULL,
    "driver_photo_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "checked_in_rug_id" "uuid"
);


ALTER TABLE "public"."pickup_request_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pickup_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "route_day" "text" DEFAULT ''::"text" NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "status" "public"."pickup_request_status" DEFAULT 'pending'::"public"."pickup_request_status" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "assigned_driver_id" "uuid",
    "assigned_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "signature_data_url" "text"
);


ALTER TABLE "public"."pickup_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "setting_key" "text" NOT NULL,
    "setting_value" "text" NOT NULL,
    "description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "updated_by" "uuid"
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portal_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "status" "text" DEFAULT 'invited'::"text" NOT NULL,
    "onboarding_completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "portal_users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'invited'::"text"])))
);


ALTER TABLE "public"."portal_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inspection_id" "uuid",
    "job_id" "uuid",
    "service_id" "text" NOT NULL,
    "service_name" "text" NOT NULL,
    "original_price" numeric NOT NULL,
    "adjusted_price" numeric NOT NULL,
    "override_reason" "text" NOT NULL,
    "override_notes" "text",
    "overridden_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."price_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "business_name" "text",
    "business_address" "text",
    "business_phone" "text",
    "business_email" "text",
    "logo_url" "text",
    "payment_method" "text" DEFAULT 'bank_transfer'::"text",
    "bank_name" "text",
    "bank_account_number" "text",
    "bank_routing_number" "text",
    "paypal_email" "text",
    "venmo_handle" "text",
    "zelle_email" "text",
    "payment_notes" "text",
    "notification_preferences" "jsonb" DEFAULT '{"jobUpdates": true, "emailReports": true, "marketingEmails": false}'::"jsonb",
    "logo_path" "text",
    "email" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "device_info" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text", 'web'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identifier" "text" NOT NULL,
    "action" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rug_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rug_id" "uuid" NOT NULL,
    "service_id" "uuid",
    "service_name" "text" DEFAULT ''::"text" NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "line_total" numeric DEFAULT 0 NOT NULL,
    "edges" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rug_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rugs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tag" "text" NOT NULL,
    "client_id" "uuid",
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "size_length" numeric,
    "size_width" numeric,
    "photo_url" "text",
    "status" "public"."rug_status" DEFAULT 'checked_in'::"public"."rug_status" NOT NULL,
    "services" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "checked_in_by" "uuid",
    "checked_in_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "picked_up_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "job_id" "uuid",
    "intake_source" "text",
    "intake_date" timestamp with time zone,
    CONSTRAINT "rugs_intake_source_check" CHECK (("intake_source" = ANY (ARRAY['pickup'::"text", 'dropoff'::"text"])))
);


ALTER TABLE "public"."rugs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_completions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "approved_estimate_id" "uuid" NOT NULL,
    "service_id" "text" NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_by" "uuid",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."service_completions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "service_name" "text" NOT NULL,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."service_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "base_price" numeric DEFAULT 0 NOT NULL,
    "preferred_price" numeric DEFAULT 0 NOT NULL,
    "vip_price" numeric DEFAULT 0 NOT NULL,
    "unit" "text" DEFAULT 'per sqft'::"text" NOT NULL,
    "category" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "requires_estimate" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."token_validation_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "identifier" "text" NOT NULL,
    "attempt_count" integer DEFAULT 1 NOT NULL,
    "first_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "blocked_until" timestamp with time zone
);


ALTER TABLE "public"."token_validation_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_analysis_feedback"
    ADD CONSTRAINT "ai_analysis_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_batch_training_items"
    ADD CONSTRAINT "ai_batch_training_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approved_estimates"
    ADD CONSTRAINT "approved_estimates_inspection_id_key" UNIQUE ("inspection_id");



ALTER TABLE ONLY "public"."approved_estimates"
    ADD CONSTRAINT "approved_estimates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_photos"
    ADD CONSTRAINT "checkin_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_accounts"
    ADD CONSTRAINT "client_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_accounts"
    ADD CONSTRAINT "client_accounts_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."client_job_access"
    ADD CONSTRAINT "client_job_access_access_token_key" UNIQUE ("access_token");



ALTER TABLE ONLY "public"."client_job_access"
    ADD CONSTRAINT "client_job_access_client_id_job_id_key" UNIQUE ("client_id", "job_id");



ALTER TABLE ONLY "public"."client_job_access"
    ADD CONSTRAINT "client_job_access_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_service_selections"
    ADD CONSTRAINT "client_service_selections_client_job_access_id_approved_est_key" UNIQUE ("client_job_access_id", "approved_estimate_id");



ALTER TABLE ONLY "public"."client_service_selections"
    ADD CONSTRAINT "client_service_selections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."communication_events"
    ADD CONSTRAINT "communication_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."company_branding"
    ADD CONSTRAINT "company_branding_company_id_key" UNIQUE ("company_id");



ALTER TABLE ONLY "public"."company_branding"
    ADD CONSTRAINT "company_branding_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_enabled_services"
    ADD CONSTRAINT "company_enabled_services_company_id_service_name_key" UNIQUE ("company_id", "service_name");



ALTER TABLE ONLY "public"."company_enabled_services"
    ADD CONSTRAINT "company_enabled_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_memberships"
    ADD CONSTRAINT "company_memberships_company_id_user_id_key" UNIQUE ("company_id", "user_id");



ALTER TABLE ONLY "public"."company_memberships"
    ADD CONSTRAINT "company_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_service_prices"
    ADD CONSTRAINT "company_service_prices_company_id_service_name_key" UNIQUE ("company_id", "service_name");



ALTER TABLE ONLY "public"."company_service_prices"
    ADD CONSTRAINT "company_service_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."declined_services"
    ADD CONSTRAINT "declined_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_list_items"
    ADD CONSTRAINT "delivery_list_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_lists"
    ADD CONSTRAINT "delivery_lists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_user_id_template_type_key" UNIQUE ("user_id", "template_type");



ALTER TABLE ONLY "public"."estimate_items"
    ADD CONSTRAINT "estimate_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_estimate_number_key" UNIQUE ("estimate_number");



ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."funnel_events"
    ADD CONSTRAINT "funnel_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intake_jobs"
    ADD CONSTRAINT "intake_jobs_job_code_key" UNIQUE ("job_code");



ALTER TABLE ONLY "public"."intake_jobs"
    ADD CONSTRAINT "intake_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_stripe_checkout_session_id_key" UNIQUE ("stripe_checkout_session_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_stripe_payment_intent_id_key" UNIQUE ("stripe_payment_intent_id");



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pickup_photos"
    ADD CONSTRAINT "pickup_photos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pickup_request_items"
    ADD CONSTRAINT "pickup_request_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pickup_requests"
    ADD CONSTRAINT "pickup_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_setting_key_key" UNIQUE ("setting_key");



ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."price_overrides"
    ADD CONSTRAINT "price_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_token_key" UNIQUE ("user_id", "token");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rug_services"
    ADD CONSTRAINT "rug_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rugs"
    ADD CONSTRAINT "rugs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rugs"
    ADD CONSTRAINT "rugs_tag_key" UNIQUE ("tag");



ALTER TABLE ONLY "public"."service_completions"
    ADD CONSTRAINT "service_completions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_completions"
    ADD CONSTRAINT "service_completions_unique_service" UNIQUE ("approved_estimate_id", "service_id");



ALTER TABLE ONLY "public"."service_prices"
    ADD CONSTRAINT "service_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_prices"
    ADD CONSTRAINT "service_prices_user_id_service_name_key" UNIQUE ("user_id", "service_name");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."token_validation_attempts"
    ADD CONSTRAINT "token_validation_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



CREATE INDEX "idx_admin_audit_logs_company_id" ON "public"."admin_audit_logs" USING "btree" ("company_id");



CREATE INDEX "idx_ai_analysis_feedback_created_at" ON "public"."ai_analysis_feedback" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_ai_analysis_feedback_inspection_id" ON "public"."ai_analysis_feedback" USING "btree" ("inspection_id");



CREATE INDEX "idx_ai_analysis_feedback_user_id" ON "public"."ai_analysis_feedback" USING "btree" ("user_id");



CREATE INDEX "idx_approved_estimates_job_id" ON "public"."approved_estimates" USING "btree" ("job_id");



CREATE INDEX "idx_audit_logs_admin_user_id" ON "public"."admin_audit_logs" USING "btree" ("admin_user_id");



CREATE INDEX "idx_audit_logs_created_at" ON "public"."admin_audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_audit_logs_entity_type" ON "public"."admin_audit_logs" USING "btree" ("entity_type");



CREATE INDEX "idx_checkin_photos_rug_id" ON "public"."checkin_photos" USING "btree" ("rug_id");



CREATE INDEX "idx_client_accounts_company_id" ON "public"."client_accounts" USING "btree" ("company_id");



CREATE INDEX "idx_client_job_access_company_id" ON "public"."client_job_access" USING "btree" ("company_id");



CREATE INDEX "idx_client_job_access_job_id" ON "public"."client_job_access" USING "btree" ("job_id");



CREATE INDEX "idx_client_job_access_token_hash" ON "public"."client_job_access" USING "btree" ("access_token_hash");



CREATE INDEX "idx_client_service_selections_approved_estimate_id" ON "public"."client_service_selections" USING "btree" ("approved_estimate_id");



CREATE INDEX "idx_clients_name" ON "public"."clients" USING "btree" ("name");



CREATE INDEX "idx_communication_events_client_id" ON "public"."communication_events" USING "btree" ("client_id");



CREATE INDEX "idx_company_memberships_company_id" ON "public"."company_memberships" USING "btree" ("company_id");



CREATE INDEX "idx_company_memberships_user_id" ON "public"."company_memberships" USING "btree" ("user_id");



CREATE INDEX "idx_company_service_prices_company_id" ON "public"."company_service_prices" USING "btree" ("company_id");



CREATE INDEX "idx_declined_services_acknowledged_by_client_id" ON "public"."declined_services" USING "btree" ("acknowledged_by_client_id");



CREATE INDEX "idx_declined_services_category" ON "public"."declined_services" USING "btree" ("service_category");



CREATE INDEX "idx_declined_services_inspection_id" ON "public"."declined_services" USING "btree" ("inspection_id");



CREATE INDEX "idx_declined_services_job_id" ON "public"."declined_services" USING "btree" ("job_id");



CREATE INDEX "idx_delivery_list_items_delivery_list_id" ON "public"."delivery_list_items" USING "btree" ("delivery_list_id");



CREATE INDEX "idx_delivery_list_items_rug_id" ON "public"."delivery_list_items" USING "btree" ("rug_id");



CREATE INDEX "idx_delivery_lists_status" ON "public"."delivery_lists" USING "btree" ("status");



CREATE INDEX "idx_email_templates_company_id" ON "public"."email_templates" USING "btree" ("company_id");



CREATE INDEX "idx_estimate_items_estimate_id" ON "public"."estimate_items" USING "btree" ("estimate_id");



CREATE INDEX "idx_estimates_client_id" ON "public"."estimates" USING "btree" ("client_id");



CREATE INDEX "idx_funnel_events_company_id" ON "public"."funnel_events" USING "btree" ("company_id");



CREATE INDEX "idx_funnel_events_created_at" ON "public"."funnel_events" USING "btree" ("created_at");



CREATE INDEX "idx_funnel_events_event_type" ON "public"."funnel_events" USING "btree" ("event_type");



CREATE INDEX "idx_funnel_events_job_id" ON "public"."funnel_events" USING "btree" ("job_id");



CREATE INDEX "idx_inspections_company_id" ON "public"."inspections" USING "btree" ("company_id");



CREATE INDEX "idx_inspections_job_id" ON "public"."inspections" USING "btree" ("job_id");



CREATE INDEX "idx_inspections_user_id" ON "public"."inspections" USING "btree" ("user_id");



CREATE INDEX "idx_intake_jobs_client_id" ON "public"."intake_jobs" USING "btree" ("client_id");



CREATE INDEX "idx_intake_jobs_intake_date" ON "public"."intake_jobs" USING "btree" ("intake_date" DESC);



CREATE INDEX "idx_intake_jobs_pickup_request_id" ON "public"."intake_jobs" USING "btree" ("pickup_request_id");



CREATE INDEX "idx_interactions_client_id_created_at" ON "public"."interactions" USING "btree" ("client_id", "created_at" DESC);



CREATE INDEX "idx_interactions_job_id_created_at" ON "public"."interactions" USING "btree" ("job_id", "created_at" DESC);



CREATE INDEX "idx_interactions_rug_id_created_at" ON "public"."interactions" USING "btree" ("rug_id", "created_at" DESC);



CREATE INDEX "idx_invoice_items_invoice_id" ON "public"."invoice_items" USING "btree" ("invoice_id");



CREATE INDEX "idx_invoices_client_id" ON "public"."invoices" USING "btree" ("client_id");



CREATE INDEX "idx_jobs_company_id" ON "public"."jobs" USING "btree" ("company_id");



CREATE INDEX "idx_jobs_user_id" ON "public"."jobs" USING "btree" ("user_id");



CREATE INDEX "idx_notifications_user_unread" ON "public"."notifications" USING "btree" ("user_id", "read") WHERE ("read" = false);



CREATE INDEX "idx_payment_attempts_invoice_id" ON "public"."payment_attempts" USING "btree" ("invoice_id");



CREATE INDEX "idx_payments_client_id" ON "public"."payments" USING "btree" ("client_id");



CREATE INDEX "idx_payments_job_id" ON "public"."payments" USING "btree" ("job_id");



CREATE INDEX "idx_payouts_company_id" ON "public"."payouts" USING "btree" ("company_id");



CREATE INDEX "idx_pickup_photos_item_id" ON "public"."pickup_photos" USING "btree" ("pickup_item_id");



CREATE INDEX "idx_pickup_request_items_checked_in_rug_id" ON "public"."pickup_request_items" USING "btree" ("checked_in_rug_id");



CREATE INDEX "idx_pickup_request_items_request_id" ON "public"."pickup_request_items" USING "btree" ("pickup_request_id");



CREATE INDEX "idx_pickup_requests_client_id" ON "public"."pickup_requests" USING "btree" ("client_id");



CREATE INDEX "idx_portal_users_client_id" ON "public"."portal_users" USING "btree" ("client_id");



CREATE INDEX "idx_portal_users_email" ON "public"."portal_users" USING "btree" ("lower"("email"));



CREATE INDEX "idx_price_overrides_inspection" ON "public"."price_overrides" USING "btree" ("inspection_id");



CREATE INDEX "idx_price_overrides_job" ON "public"."price_overrides" USING "btree" ("job_id");



CREATE INDEX "idx_push_tokens_user_id" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_rate_limits_lookup" ON "public"."rate_limits" USING "btree" ("identifier", "action", "created_at");



CREATE INDEX "idx_rug_services_rug_id" ON "public"."rug_services" USING "btree" ("rug_id");



CREATE INDEX "idx_rugs_client_id" ON "public"."rugs" USING "btree" ("client_id");



CREATE INDEX "idx_rugs_job_id" ON "public"."rugs" USING "btree" ("job_id");



CREATE INDEX "idx_rugs_status" ON "public"."rugs" USING "btree" ("status");



CREATE INDEX "idx_service_completions_completed_by" ON "public"."service_completions" USING "btree" ("completed_by");



CREATE INDEX "idx_services_active" ON "public"."services" USING "btree" ("active");



CREATE INDEX "idx_token_validation_identifier" ON "public"."token_validation_attempts" USING "btree" ("identifier");



CREATE OR REPLACE TRIGGER "prevent_audit_log_modifications" BEFORE DELETE OR UPDATE ON "public"."admin_audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_audit_log_changes"();



CREATE OR REPLACE TRIGGER "set_client_access_company_id_trigger" BEFORE INSERT ON "public"."client_job_access" FOR EACH ROW EXECUTE FUNCTION "public"."set_client_access_company_id"();



CREATE OR REPLACE TRIGGER "set_inspection_company_id_trigger" BEFORE INSERT ON "public"."inspections" FOR EACH ROW EXECUTE FUNCTION "public"."set_inspection_company_id"();



CREATE OR REPLACE TRIGGER "set_job_company_id_trigger" BEFORE INSERT ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_job_company_id"();



CREATE OR REPLACE TRIGGER "trg_prevent_conflicting_roles" BEFORE INSERT ON "public"."user_roles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_conflicting_roles"();



CREATE OR REPLACE TRIGGER "update_approved_estimates_updated_at" BEFORE UPDATE ON "public"."approved_estimates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_client_accounts_updated_at" BEFORE UPDATE ON "public"."client_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_client_service_selections_updated_at" BEFORE UPDATE ON "public"."client_service_selections" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_companies_updated_at" BEFORE UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_company_branding_updated_at" BEFORE UPDATE ON "public"."company_branding" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_company_enabled_services_timestamp" BEFORE UPDATE ON "public"."company_enabled_services" FOR EACH ROW EXECUTE FUNCTION "public"."update_enabled_services_timestamp"();



CREATE OR REPLACE TRIGGER "update_company_service_prices_updated_at" BEFORE UPDATE ON "public"."company_service_prices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_delivery_lists_updated_at" BEFORE UPDATE ON "public"."delivery_lists" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_email_templates_updated_at" BEFORE UPDATE ON "public"."email_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_estimates_updated_at" BEFORE UPDATE ON "public"."estimates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_intake_jobs_updated_at" BEFORE UPDATE ON "public"."intake_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_invoices_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_job_activity_on_completion" AFTER INSERT ON "public"."service_completions" FOR EACH ROW EXECUTE FUNCTION "public"."update_job_last_activity"();



CREATE OR REPLACE TRIGGER "update_jobs_updated_at" BEFORE UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_payouts_updated_at" BEFORE UPDATE ON "public"."payouts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_pickup_requests_updated_at" BEFORE UPDATE ON "public"."pickup_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_platform_settings_updated_at" BEFORE UPDATE ON "public"."platform_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_push_tokens_updated_at" BEFORE UPDATE ON "public"."push_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_service_prices_updated_at" BEFORE UPDATE ON "public"."service_prices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_services_updated_at" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."ai_analysis_feedback"
    ADD CONSTRAINT "ai_analysis_feedback_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."approved_estimates"
    ADD CONSTRAINT "approved_estimates_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approved_estimates"
    ADD CONSTRAINT "approved_estimates_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checkin_photos"
    ADD CONSTRAINT "checkin_photos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checkin_photos"
    ADD CONSTRAINT "checkin_photos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checkin_photos"
    ADD CONSTRAINT "checkin_photos_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."intake_jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."checkin_photos"
    ADD CONSTRAINT "checkin_photos_rug_id_fkey" FOREIGN KEY ("rug_id") REFERENCES "public"."rugs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_accounts"
    ADD CONSTRAINT "client_accounts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."client_accounts"
    ADD CONSTRAINT "client_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_job_access"
    ADD CONSTRAINT "client_job_access_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."client_accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_job_access"
    ADD CONSTRAINT "client_job_access_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."client_job_access"
    ADD CONSTRAINT "client_job_access_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_service_selections"
    ADD CONSTRAINT "client_service_selections_approved_estimate_id_fkey" FOREIGN KEY ("approved_estimate_id") REFERENCES "public"."approved_estimates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_service_selections"
    ADD CONSTRAINT "client_service_selections_client_job_access_id_fkey" FOREIGN KEY ("client_job_access_id") REFERENCES "public"."client_job_access"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."communication_events"
    ADD CONSTRAINT "communication_events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."communication_events"
    ADD CONSTRAINT "communication_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."communication_events"
    ADD CONSTRAINT "communication_events_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."communication_events"
    ADD CONSTRAINT "communication_events_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."communication_events"
    ADD CONSTRAINT "communication_events_rug_id_fkey" FOREIGN KEY ("rug_id") REFERENCES "public"."rugs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_branding"
    ADD CONSTRAINT "company_branding_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_enabled_services"
    ADD CONSTRAINT "company_enabled_services_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_memberships"
    ADD CONSTRAINT "company_memberships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_service_prices"
    ADD CONSTRAINT "company_service_prices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."declined_services"
    ADD CONSTRAINT "declined_services_acknowledged_by_client_id_fkey" FOREIGN KEY ("acknowledged_by_client_id") REFERENCES "public"."client_accounts"("id");



ALTER TABLE ONLY "public"."declined_services"
    ADD CONSTRAINT "declined_services_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."declined_services"
    ADD CONSTRAINT "declined_services_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_list_items"
    ADD CONSTRAINT "delivery_list_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_list_items"
    ADD CONSTRAINT "delivery_list_items_delivery_list_id_fkey" FOREIGN KEY ("delivery_list_id") REFERENCES "public"."delivery_lists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_list_items"
    ADD CONSTRAINT "delivery_list_items_rug_id_fkey" FOREIGN KEY ("rug_id") REFERENCES "public"."rugs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_lists"
    ADD CONSTRAINT "delivery_lists_checked_out_by_fkey" FOREIGN KEY ("checked_out_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."delivery_lists"
    ADD CONSTRAINT "delivery_lists_compiled_by_fkey" FOREIGN KEY ("compiled_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_templates"
    ADD CONSTRAINT "email_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."estimate_items"
    ADD CONSTRAINT "estimate_items_estimate_id_fkey" FOREIGN KEY ("estimate_id") REFERENCES "public"."estimates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."estimate_items"
    ADD CONSTRAINT "estimate_items_rug_service_id_fkey" FOREIGN KEY ("rug_service_id") REFERENCES "public"."rug_services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."estimates"
    ADD CONSTRAINT "estimates_rug_id_fkey" FOREIGN KEY ("rug_id") REFERENCES "public"."rugs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."funnel_events"
    ADD CONSTRAINT "funnel_events_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."funnel_events"
    ADD CONSTRAINT "funnel_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inspections"
    ADD CONSTRAINT "inspections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."intake_jobs"
    ADD CONSTRAINT "intake_jobs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."intake_jobs"
    ADD CONSTRAINT "intake_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."intake_jobs"
    ADD CONSTRAINT "intake_jobs_pickup_request_id_fkey" FOREIGN KEY ("pickup_request_id") REFERENCES "public"."pickup_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."intake_jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_pickup_request_id_fkey" FOREIGN KEY ("pickup_request_id") REFERENCES "public"."pickup_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."interactions"
    ADD CONSTRAINT "interactions_rug_id_fkey" FOREIGN KEY ("rug_id") REFERENCES "public"."rugs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_rug_id_fkey" FOREIGN KEY ("rug_id") REFERENCES "public"."rugs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_delivery_list_id_fkey" FOREIGN KEY ("delivery_list_id") REFERENCES "public"."delivery_lists"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_attempts"
    ADD CONSTRAINT "payment_attempts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."client_accounts"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payouts"
    ADD CONSTRAINT "payouts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."pickup_photos"
    ADD CONSTRAINT "pickup_photos_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pickup_photos"
    ADD CONSTRAINT "pickup_photos_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pickup_photos"
    ADD CONSTRAINT "pickup_photos_pickup_item_id_fkey" FOREIGN KEY ("pickup_item_id") REFERENCES "public"."pickup_request_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickup_photos"
    ADD CONSTRAINT "pickup_photos_pickup_request_id_fkey" FOREIGN KEY ("pickup_request_id") REFERENCES "public"."pickup_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickup_request_items"
    ADD CONSTRAINT "pickup_request_items_checked_in_rug_id_fkey" FOREIGN KEY ("checked_in_rug_id") REFERENCES "public"."rugs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pickup_request_items"
    ADD CONSTRAINT "pickup_request_items_pickup_request_id_fkey" FOREIGN KEY ("pickup_request_id") REFERENCES "public"."pickup_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickup_request_items"
    ADD CONSTRAINT "pickup_request_items_rug_id_fkey" FOREIGN KEY ("rug_id") REFERENCES "public"."rugs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pickup_requests"
    ADD CONSTRAINT "pickup_requests_assigned_driver_id_fkey" FOREIGN KEY ("assigned_driver_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pickup_requests"
    ADD CONSTRAINT "pickup_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pickup_requests"
    ADD CONSTRAINT "pickup_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."portal_users"
    ADD CONSTRAINT "portal_users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."price_overrides"
    ADD CONSTRAINT "price_overrides_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "public"."inspections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."price_overrides"
    ADD CONSTRAINT "price_overrides_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rug_services"
    ADD CONSTRAINT "rug_services_rug_id_fkey" FOREIGN KEY ("rug_id") REFERENCES "public"."rugs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rug_services"
    ADD CONSTRAINT "rug_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rugs"
    ADD CONSTRAINT "rugs_checked_in_by_fkey" FOREIGN KEY ("checked_in_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."rugs"
    ADD CONSTRAINT "rugs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rugs"
    ADD CONSTRAINT "rugs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."intake_jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."service_completions"
    ADD CONSTRAINT "service_completions_approved_estimate_id_fkey" FOREIGN KEY ("approved_estimate_id") REFERENCES "public"."approved_estimates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_completions"
    ADD CONSTRAINT "service_completions_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can insert audit logs" ON "public"."admin_audit_logs" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage batch training items" ON "public"."ai_batch_training_items" TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role")) WITH CHECK ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage payouts" ON "public"."payouts" TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage platform settings" ON "public"."platform_settings" TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all approved estimates" ON "public"."approved_estimates" FOR SELECT TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all inspections" ON "public"."inspections" FOR SELECT TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all jobs" ON "public"."jobs" FOR SELECT TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view all payments" ON "public"."payments" FOR SELECT TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can view audit laogs" ON "public"."admin_audit_logs" FOR SELECT TO "authenticated" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Anyone authenticated can create company" ON "public"."companies" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can view platform settings" ON "public"."platform_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Clients can claim access by token" ON "public"."client_job_access" FOR UPDATE USING (("client_id" IS NULL)) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."client_accounts" "ca"
  WHERE (("ca"."id" = "client_job_access"."client_id") AND ("ca"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Clients can delete selections for unpaid jobs" ON "public"."client_service_selections" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."client_job_access" "cja"
     JOIN "public"."client_accounts" "ca" ON (("ca"."id" = "cja"."client_id")))
     JOIN "public"."jobs" "j" ON (("j"."id" = "cja"."job_id")))
  WHERE (("cja"."id" = "client_service_selections"."client_job_access_id") AND ("ca"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("j"."payment_status" IS DISTINCT FROM 'paid'::"text")))));



CREATE POLICY "Clients can insert declined services for unpaid jobs" ON "public"."declined_services" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "declined_services"."job_id") AND "public"."client_has_job_access"("j"."id") AND ("j"."payment_status" IS DISTINCT FROM 'paid'::"text")))));



CREATE POLICY "Clients can insert selections for unpaid jobs" ON "public"."client_service_selections" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."client_job_access" "cja"
     JOIN "public"."client_accounts" "ca" ON (("ca"."id" = "cja"."client_id")))
     JOIN "public"."jobs" "j" ON (("j"."id" = "cja"."job_id")))
  WHERE (("cja"."id" = "client_service_selections"."client_job_access_id") AND ("ca"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("j"."payment_status" IS DISTINCT FROM 'paid'::"text")))));



CREATE POLICY "Clients can insert their own account" ON "public"."client_accounts" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Clients can update selections for unpaid jobs" ON "public"."client_service_selections" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."client_job_access" "cja"
     JOIN "public"."client_accounts" "ca" ON (("ca"."id" = "cja"."client_id")))
     JOIN "public"."jobs" "j" ON (("j"."id" = "cja"."job_id")))
  WHERE (("cja"."id" = "client_service_selections"."client_job_access_id") AND ("ca"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("j"."payment_status" IS DISTINCT FROM 'paid'::"text")))));



CREATE POLICY "Clients can update their own account" ON "public"."client_accounts" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Clients can view company branding via job access" ON "public"."company_branding" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."client_job_access" "cja"
     JOIN "public"."client_accounts" "ca" ON (("ca"."id" = "cja"."client_id")))
     JOIN "public"."jobs" "j" ON (("j"."id" = "cja"."job_id")))
  WHERE (("ca"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("j"."company_id" = "company_branding"."company_id")))));



CREATE POLICY "Clients can view declined services for their jobs" ON "public"."declined_services" FOR SELECT USING ("public"."client_has_job_access"("job_id"));



CREATE POLICY "Clients can view estimates for their jobs" ON "public"."approved_estimates" FOR SELECT USING ("public"."client_has_job_access"("job_id"));



CREATE POLICY "Clients can view inspections for their jobs" ON "public"."inspections" FOR SELECT USING ("public"."client_has_job_access"("job_id"));



CREATE POLICY "Clients can view jobs they have access to" ON "public"."jobs" FOR SELECT USING ("public"."client_has_job_access"("id"));



CREATE POLICY "Clients can view their own account" ON "public"."client_accounts" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Clients can view their own job access" ON "public"."client_job_access" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."client_accounts" "ca"
  WHERE (("ca"."id" = "client_job_access"."client_id") AND ("ca"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Clients can view their own payments" ON "public"."payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."client_job_access" "cja"
     JOIN "public"."client_accounts" "ca" ON (("ca"."id" = "cja"."client_id")))
  WHERE (("cja"."job_id" = "payments"."job_id") AND ("ca"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Clients can view their own selections" ON "public"."client_service_selections" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."client_job_access" "cja"
     JOIN "public"."client_accounts" "ca" ON (("ca"."id" = "cja"."client_id")))
  WHERE (("cja"."id" = "client_service_selections"."client_job_access_id") AND ("ca"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Company admins can manage branding" ON "public"."company_branding" USING ("public"."is_company_admin"(( SELECT "auth"."uid"() AS "uid"), "company_id"));



CREATE POLICY "Company admins can manage email templates" ON "public"."email_templates" USING (("public"."is_company_admin"(( SELECT "auth"."uid"() AS "uid"), "company_id") OR (("company_id" IS NULL) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Company admins can manage enabled services" ON "public"."company_enabled_services" USING ("public"."is_company_admin"(( SELECT "auth"."uid"() AS "uid"), "company_id"));



CREATE POLICY "Company admins can manage memberships" ON "public"."company_memberships" USING ("public"."is_company_admin"(( SELECT "auth"."uid"() AS "uid"), "company_id"));



CREATE POLICY "Company admins can manage service prices" ON "public"."company_service_prices" USING ("public"."is_company_admin"(( SELECT "auth"."uid"() AS "uid"), "company_id"));



CREATE POLICY "Company admins can update their company" ON "public"."companies" FOR UPDATE USING ("public"."is_company_admin"(( SELECT "auth"."uid"() AS "uid"), "id"));



CREATE POLICY "Deny audit log deletions" ON "public"."admin_audit_logs" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "Deny audit log updates" ON "public"."admin_audit_logs" FOR UPDATE TO "authenticated" USING (false);



CREATE POLICY "Platform admins can manage all companies" ON "public"."companies" USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Platform admins can view all branding" ON "public"."company_branding" FOR SELECT USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Platform admins can view all companies" ON "public"."companies" FOR SELECT USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Platform admins can view all memberships" ON "public"."company_memberships" FOR SELECT USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Platform admins can view all service prices" ON "public"."company_service_prices" FOR SELECT USING ("public"."has_role"(( SELECT "auth"."uid"() AS "uid"), 'admin'::"public"."app_role"));



CREATE POLICY "Service role only" ON "public"."rate_limits" USING (false);



CREATE POLICY "Service role only" ON "public"."token_validation_attempts" USING (false);



CREATE POLICY "Staff can create price overrides for their jobs" ON "public"."price_overrides" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "price_overrides"."job_id") AND ("jobs"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Staff can delete company inspections" ON "public"."inspections" FOR DELETE USING ((("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))) OR (("company_id" IS NULL) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Staff can delete pending payments for their jobs" ON "public"."payments" FOR DELETE TO "authenticated" USING ((("status" = 'pending'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "payments"."job_id") AND ("jobs"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Staff can delete their company's jobs" ON "public"."jobs" FOR DELETE USING ((("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))) OR (("company_id" IS NULL) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Staff can insert company inspections" ON "public"."inspections" FOR INSERT WITH CHECK ((("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))) OR (("company_id" IS NULL) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Staff can insert jobs for their company" ON "public"."jobs" FOR INSERT WITH CHECK ((("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))) OR (("company_id" IS NULL) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Staff can manage access for company jobs" ON "public"."client_job_access" USING (((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "client_job_access"."job_id") AND ("j"."company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid")))))) OR (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "client_job_access"."job_id") AND ("j"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "client_job_access"."job_id") AND ("j"."company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid")))))) OR (EXISTS ( SELECT 1
   FROM "public"."jobs" "j"
  WHERE (("j"."id" = "client_job_access"."job_id") AND ("j"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Staff can manage declined services for their jobs" ON "public"."declined_services" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "declined_services"."job_id") AND ("jobs"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Staff can manage their own job estimates" ON "public"."approved_estimates" USING ((EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "approved_estimates"."job_id") AND ("jobs"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Staff can manage their service completions" ON "public"."service_completions" USING ((EXISTS ( SELECT 1
   FROM ("public"."approved_estimates" "ae"
     JOIN "public"."jobs" "j" ON (("j"."id" = "ae"."job_id")))
  WHERE (("ae"."id" = "service_completions"."approved_estimate_id") AND ("j"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Staff can update company inspections" ON "public"."inspections" FOR UPDATE USING ((("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))) OR (("company_id" IS NULL) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Staff can update their company's jobs" ON "public"."jobs" FOR UPDATE USING ((("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))) OR (("company_id" IS NULL) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Staff can view company client accounts" ON "public"."client_accounts" FOR SELECT USING (("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Staff can view company email templates" ON "public"."email_templates" FOR SELECT USING ((("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))) OR (("company_id" IS NULL) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Staff can view company inspections" ON "public"."inspections" FOR SELECT USING ((("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))) OR (("company_id" IS NULL) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Staff can view company payouts" ON "public"."payouts" FOR SELECT USING ((("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))) OR (("company_id" IS NULL) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Staff can view payments for their jobs" ON "public"."payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."jobs"
  WHERE (("jobs"."id" = "payments"."job_id") AND ("jobs"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Staff can view selections for their jobs" ON "public"."client_service_selections" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."client_job_access" "cja"
     JOIN "public"."jobs" "j" ON (("j"."id" = "cja"."job_id")))
  WHERE (("cja"."id" = "client_service_selections"."client_job_access_id") AND ("j"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Staff can view their company's enabled services" ON "public"."company_enabled_services" FOR SELECT USING (("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Staff can view their company's jobs" ON "public"."jobs" FOR SELECT USING ((("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))) OR (("company_id" IS NULL) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Staff can view their own price overrides" ON "public"."price_overrides" FOR SELECT USING (("overridden_by" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can create branding for their company" ON "public"."company_branding" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."company_memberships" "cm"
  WHERE (("cm"."company_id" = "company_branding"."company_id") AND ("cm"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("cm"."role" = 'company_admin'::"public"."company_role")))));



CREATE POLICY "Users can create their own membership" ON "public"."company_memberships" FOR INSERT WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can delete their own notifications" ON "public"."notifications" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own push tokens" ON "public"."push_tokens" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can delete their own service prices" ON "public"."service_prices" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own push tokens" ON "public"."push_tokens" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own service prices" ON "public"."service_prices" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can manage their own feedback" ON "public"."ai_analysis_feedback" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own push tokens" ON "public"."push_tokens" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own service prices" ON "public"."service_prices" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view company they are creating" ON "public"."companies" FOR SELECT TO "authenticated" USING (((NOT (EXISTS ( SELECT 1
   FROM "public"."company_memberships"
  WHERE ("company_memberships"."company_id" = "companies"."id")))) AND ("created_at" > ("now"() - '00:00:05'::interval))));



CREATE POLICY "Users can view their company's branding" ON "public"."company_branding" FOR SELECT USING (("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can view their company's memberships" ON "public"."company_memberships" FOR SELECT USING (("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can view their company's service prices" ON "public"."company_service_prices" FOR SELECT USING (("company_id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can view their own company" ON "public"."companies" FOR SELECT USING (("id" = "public"."get_user_company_id"(( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own push tokens" ON "public"."push_tokens" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own service prices" ON "public"."service_prices" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."admin_audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_analysis_feedback" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_batch_training_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."approved_estimates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_insert_admin_office" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "audit_log_select_admin" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



ALTER TABLE "public"."checkin_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "checkin_photos_manage_internal" ON "public"."checkin_photos" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role")));



CREATE POLICY "checkin_photos_select_scoped" ON "public"."checkin_photos" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'driver'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "checkin_photos"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



ALTER TABLE "public"."client_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_job_access" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_service_selections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_delete_internal" ON "public"."clients" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "clients_insert_internal" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "clients_select_scoped" ON "public"."clients" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'driver'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "clients"."id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



CREATE POLICY "clients_update_internal" ON "public"."clients" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



ALTER TABLE "public"."communication_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "communication_events_delete_admin_office" ON "public"."communication_events" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "communication_events_insert_internal" ON "public"."communication_events" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "communication_events_insert_portal" ON "public"."communication_events" FOR INSERT TO "authenticated" WITH CHECK ((("client_id" IS NOT NULL) AND ("channel" = 'in_app_chat'::"public"."communication_channel") AND ("direction" = 'inbound'::"public"."communication_direction") AND (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "communication_events"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



CREATE POLICY "communication_events_select_scoped" ON "public"."communication_events" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR (("client_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "communication_events"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text")))))))));



CREATE POLICY "communication_events_update_admin_office" ON "public"."communication_events" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_branding" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_enabled_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_service_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."declined_services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_list_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_list_items_manage_admin_office" ON "public"."delivery_list_items" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



ALTER TABLE "public"."delivery_lists" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delivery_lists_manage_admin_office" ON "public"."delivery_lists" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



ALTER TABLE "public"."email_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."estimate_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "estimate_items_manage_admin_office" ON "public"."estimate_items" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "estimate_items_select_scoped" ON "public"."estimate_items" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM ("public"."estimates" "e"
     JOIN "public"."portal_users" "pu" ON (("pu"."client_id" = "e"."client_id")))
  WHERE (("e"."id" = "estimate_items"."estimate_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



ALTER TABLE "public"."estimates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "estimates_delete_admin_office" ON "public"."estimates" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "estimates_insert_admin_office" ON "public"."estimates" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "estimates_select_scoped" ON "public"."estimates" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "estimates"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



CREATE POLICY "estimates_update_admin_office" ON "public"."estimates" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "estimates_update_portal_sent_transition" ON "public"."estimates" FOR UPDATE TO "authenticated" USING ((("status" = 'sent'::"public"."estimate_status") AND (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "estimates"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text")))))))) WITH CHECK ((("status" = ANY (ARRAY['approved'::"public"."estimate_status", 'rejected'::"public"."estimate_status"])) AND (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "estimates"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



ALTER TABLE "public"."funnel_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "funnel_events_service_all" ON "public"."funnel_events" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "funnel_events_staff_insert" ON "public"."funnel_events" FOR INSERT TO "authenticated" WITH CHECK ((("actor" = 'staff'::"text") AND ("job_id" IN ( SELECT "j"."id"
   FROM ("public"."jobs" "j"
     LEFT JOIN "public"."company_memberships" "cm" ON ((("cm"."company_id" = "j"."company_id") AND ("cm"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))
  WHERE (("j"."user_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("cm"."user_id" IS NOT NULL))))));



CREATE POLICY "funnel_events_staff_select" ON "public"."funnel_events" FOR SELECT TO "authenticated" USING ((("company_id" IN ( SELECT "company_memberships"."company_id"
   FROM "public"."company_memberships"
  WHERE ("company_memberships"."user_id" = ( SELECT "auth"."uid"() AS "uid")))) OR ("job_id" IN ( SELECT "jobs"."id"
   FROM "public"."jobs"
  WHERE ("jobs"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



ALTER TABLE "public"."inspections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intake_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "intake_jobs_manage_internal" ON "public"."intake_jobs" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role")));



CREATE POLICY "intake_jobs_select_scoped" ON "public"."intake_jobs" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'driver'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "intake_jobs"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



ALTER TABLE "public"."interactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "interactions_insert_internal" ON "public"."interactions" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'driver'::"public"."app_role")));



CREATE POLICY "interactions_select_scoped" ON "public"."interactions" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "interactions"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_items_manage_admin_office" ON "public"."invoice_items" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "invoice_items_select_scoped" ON "public"."invoice_items" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM ("public"."invoices" "i"
     JOIN "public"."portal_users" "pu" ON (("pu"."client_id" = "i"."client_id")))
  WHERE (("i"."id" = "invoice_items"."invoice_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_manage_admin_office" ON "public"."invoices" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "invoices_select_scoped" ON "public"."invoices" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "invoices"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_attempts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_attempts_manage_admin_office" ON "public"."payment_attempts" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "payment_attempts_select_scoped" ON "public"."payment_attempts" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "payment_attempts"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payouts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pickup_photos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pickup_photos_delete_driver_internal" ON "public"."pickup_photos" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'driver'::"public"."app_role")));



CREATE POLICY "pickup_photos_insert_driver_internal" ON "public"."pickup_photos" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'driver'::"public"."app_role")));



CREATE POLICY "pickup_photos_select_scoped" ON "public"."pickup_photos" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'driver'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "pickup_photos"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



ALTER TABLE "public"."pickup_request_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pickup_request_items_delete_internal" ON "public"."pickup_request_items" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "pickup_request_items_delete_portal_pending" ON "public"."pickup_request_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."pickup_requests" "pr"
     JOIN "public"."portal_users" "pu" ON (("pu"."client_id" = "pr"."client_id")))
  WHERE (("pr"."id" = "pickup_request_items"."pickup_request_id") AND ("pr"."status" = 'pending'::"public"."pickup_request_status") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text")))))));



CREATE POLICY "pickup_request_items_insert_internal" ON "public"."pickup_request_items" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "pickup_request_items_insert_portal_pending" ON "public"."pickup_request_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."pickup_requests" "pr"
     JOIN "public"."portal_users" "pu" ON (("pu"."client_id" = "pr"."client_id")))
  WHERE (("pr"."id" = "pickup_request_items"."pickup_request_id") AND ("pr"."status" = 'pending'::"public"."pickup_request_status") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text")))))));



CREATE POLICY "pickup_request_items_select_scoped" ON "public"."pickup_request_items" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM "public"."pickup_requests" "pr"
  WHERE (("pr"."id" = "pickup_request_items"."pickup_request_id") AND ("pr"."assigned_driver_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM ("public"."pickup_requests" "pr"
     JOIN "public"."portal_users" "pu" ON (("pu"."client_id" = "pr"."client_id")))
  WHERE (("pr"."id" = "pickup_request_items"."pickup_request_id") AND ("pr"."status" = 'pending'::"public"."pickup_request_status") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



CREATE POLICY "pickup_request_items_update_driver_assigned" ON "public"."pickup_request_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."pickup_requests" "pr"
  WHERE (("pr"."id" = "pickup_request_items"."pickup_request_id") AND ("pr"."assigned_driver_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."pickup_requests" "pr"
  WHERE (("pr"."id" = "pickup_request_items"."pickup_request_id") AND ("pr"."assigned_driver_id" = "auth"."uid"())))));



CREATE POLICY "pickup_request_items_update_internal" ON "public"."pickup_request_items" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "pickup_request_items_update_portal_pending" ON "public"."pickup_request_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."pickup_requests" "pr"
     JOIN "public"."portal_users" "pu" ON (("pu"."client_id" = "pr"."client_id")))
  WHERE (("pr"."id" = "pickup_request_items"."pickup_request_id") AND ("pr"."status" = 'pending'::"public"."pickup_request_status") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."pickup_requests" "pr"
     JOIN "public"."portal_users" "pu" ON (("pu"."client_id" = "pr"."client_id")))
  WHERE (("pr"."id" = "pickup_request_items"."pickup_request_id") AND ("pr"."status" = 'pending'::"public"."pickup_request_status") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text")))))));



ALTER TABLE "public"."pickup_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pickup_requests_delete_internal" ON "public"."pickup_requests" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "pickup_requests_delete_portal_pending" ON "public"."pickup_requests" FOR DELETE TO "authenticated" USING ((("status" = 'pending'::"public"."pickup_request_status") AND (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "pickup_requests"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



CREATE POLICY "pickup_requests_insert_internal" ON "public"."pickup_requests" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "pickup_requests_insert_portal" ON "public"."pickup_requests" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "pickup_requests"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text")))))));



CREATE POLICY "pickup_requests_select_scoped" ON "public"."pickup_requests" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role") OR ("assigned_driver_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "pickup_requests"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



CREATE POLICY "pickup_requests_update_driver_assigned" ON "public"."pickup_requests" FOR UPDATE TO "authenticated" USING (("assigned_driver_id" = "auth"."uid"())) WITH CHECK (("assigned_driver_id" = "auth"."uid"()));



CREATE POLICY "pickup_requests_update_internal" ON "public"."pickup_requests" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "pickup_requests_update_portal_pending" ON "public"."pickup_requests" FOR UPDATE TO "authenticated" USING ((("status" = 'pending'::"public"."pickup_request_status") AND (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "pickup_requests"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text")))))))) WITH CHECK ((("status" = 'pending'::"public"."pickup_request_status") AND (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "pickup_requests"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portal_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "portal_users_delete_internal" ON "public"."portal_users" FOR DELETE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "portal_users_insert_internal" ON "public"."portal_users" FOR INSERT TO "authenticated" WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "portal_users_select_scoped" ON "public"."portal_users" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR ("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text")))));



CREATE POLICY "portal_users_update_internal" ON "public"."portal_users" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



ALTER TABLE "public"."price_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_office_superadmin_select_all" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."is_super_admin"()));



CREATE POLICY "profiles_self_insert" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "profiles_self_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "profiles_self_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rug_services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rug_services_manage_internal" ON "public"."rug_services" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role")));



CREATE POLICY "rug_services_select_internal" ON "public"."rug_services" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role")));



ALTER TABLE "public"."rugs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rugs_manage_internal" ON "public"."rugs" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role")));



CREATE POLICY "rugs_select_scoped" ON "public"."rugs" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'driver'::"public"."app_role") OR (EXISTS ( SELECT 1
   FROM "public"."portal_users" "pu"
  WHERE (("pu"."client_id" = "rugs"."client_id") AND ("pu"."status" = 'active'::"text") AND ("lower"("pu"."email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))))))));



ALTER TABLE "public"."service_completions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."service_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "services_manage_admin_office" ON "public"."services" TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role"))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role")));



CREATE POLICY "services_select_internal" ON "public"."services" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'checkin_staff'::"public"."app_role")));



ALTER TABLE "public"."token_validation_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_admin_manage_scoped" ON "public"."user_roles" TO "authenticated" USING (("public"."is_super_admin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("role" <> 'admin'::"public"."app_role")))) WITH CHECK (("public"."is_super_admin"() OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("role" <> 'admin'::"public"."app_role"))));



CREATE POLICY "user_roles_admin_office_superadmin_select_all" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR "public"."has_role"("auth"."uid"(), 'office'::"public"."app_role") OR "public"."is_super_admin"()));



CREATE POLICY "user_roles_self_select" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."notifications";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





























































































































































































GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_identifier" "text", "p_action" "text", "p_max_requests" integer, "p_window_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_identifier" "text", "p_action" "text", "p_max_requests" integer, "p_window_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_identifier" "text", "p_action" "text", "p_max_requests" integer, "p_window_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_token_rate_limit"("_identifier" "text", "_max_attempts" integer, "_window_seconds" integer, "_block_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."check_token_rate_limit"("_identifier" "text", "_max_attempts" integer, "_window_seconds" integer, "_block_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_token_rate_limit"("_identifier" "text", "_max_attempts" integer, "_window_seconds" integer, "_block_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."client_has_job_access"("check_job_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."client_has_job_access"("check_job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."client_has_job_access"("check_job_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."company_can_create_jobs"("_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."company_can_create_jobs"("_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."company_can_create_jobs"("_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."company_has_feature"("_company_id" "uuid", "_feature" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."company_has_feature"("_company_id" "uuid", "_feature" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."company_has_feature"("_company_id" "uuid", "_feature" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."company_max_staff"("_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."company_max_staff"("_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."company_max_staff"("_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_company_id"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_company_id"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_company_id"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_company_role"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_company_role"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_company_role"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_company_admin"("_user_id" "uuid", "_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_company_admin"("_user_id" "uuid", "_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_company_admin"("_user_id" "uuid", "_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_super_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_portal_onboarding_complete"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_portal_onboarding_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_portal_onboarding_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_portal_onboarding_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_audit_log_changes"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_audit_log_changes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_audit_log_changes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_conflicting_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_conflicting_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_conflicting_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_client_funnel_event"("_access_token" "text", "_event_type" "text", "_payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."record_client_funnel_event"("_access_token" "text", "_event_type" "text", "_payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_client_funnel_event"("_access_token" "text", "_event_type" "text", "_payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_token_rate_limit"("_identifier" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."reset_token_rate_limit"("_identifier" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_token_rate_limit"("_identifier" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_client_access_company_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_client_access_company_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_client_access_company_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_inspection_company_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_inspection_company_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_inspection_company_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_job_company_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_job_company_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_job_company_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_client_access_tracking"("_access_token" "text", "_first_accessed" boolean, "_password_set" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_client_access_tracking"("_access_token" "text", "_first_accessed" boolean, "_password_set" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_client_access_tracking"("_access_token" "text", "_first_accessed" boolean, "_password_set" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_enabled_services_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_enabled_services_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_enabled_services_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_job_last_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_job_last_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_job_last_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_belongs_to_company"("_user_id" "uuid", "_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_belongs_to_company"("_user_id" "uuid", "_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_belongs_to_company"("_user_id" "uuid", "_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_access_token"("_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_access_token"("_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_access_token"("_token" "text") TO "service_role";
























GRANT ALL ON TABLE "public"."admin_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."ai_analysis_feedback" TO "anon";
GRANT ALL ON TABLE "public"."ai_analysis_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_analysis_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."ai_batch_training_items" TO "anon";
GRANT ALL ON TABLE "public"."ai_batch_training_items" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_batch_training_items" TO "service_role";



GRANT ALL ON TABLE "public"."approved_estimates" TO "anon";
GRANT ALL ON TABLE "public"."approved_estimates" TO "authenticated";
GRANT ALL ON TABLE "public"."approved_estimates" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."checkin_photos" TO "anon";
GRANT ALL ON TABLE "public"."checkin_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."checkin_photos" TO "service_role";



GRANT ALL ON TABLE "public"."client_accounts" TO "anon";
GRANT ALL ON TABLE "public"."client_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."client_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."client_job_access" TO "anon";
GRANT ALL ON TABLE "public"."client_job_access" TO "authenticated";
GRANT ALL ON TABLE "public"."client_job_access" TO "service_role";



GRANT ALL ON TABLE "public"."client_service_selections" TO "anon";
GRANT ALL ON TABLE "public"."client_service_selections" TO "authenticated";
GRANT ALL ON TABLE "public"."client_service_selections" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."communication_events" TO "anon";
GRANT ALL ON TABLE "public"."communication_events" TO "authenticated";
GRANT ALL ON TABLE "public"."communication_events" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."company_branding" TO "authenticated";
GRANT ALL ON TABLE "public"."company_branding" TO "service_role";



GRANT ALL ON TABLE "public"."company_enabled_services" TO "anon";
GRANT ALL ON TABLE "public"."company_enabled_services" TO "authenticated";
GRANT ALL ON TABLE "public"."company_enabled_services" TO "service_role";



GRANT ALL ON TABLE "public"."company_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."company_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."company_service_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."company_service_prices" TO "service_role";



GRANT ALL ON TABLE "public"."declined_services" TO "anon";
GRANT ALL ON TABLE "public"."declined_services" TO "authenticated";
GRANT ALL ON TABLE "public"."declined_services" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_list_items" TO "anon";
GRANT ALL ON TABLE "public"."delivery_list_items" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_list_items" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_lists" TO "anon";
GRANT ALL ON TABLE "public"."delivery_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_lists" TO "service_role";



GRANT ALL ON TABLE "public"."email_templates" TO "anon";
GRANT ALL ON TABLE "public"."email_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."email_templates" TO "service_role";



GRANT ALL ON TABLE "public"."estimate_items" TO "anon";
GRANT ALL ON TABLE "public"."estimate_items" TO "authenticated";
GRANT ALL ON TABLE "public"."estimate_items" TO "service_role";



GRANT ALL ON TABLE "public"."estimates" TO "anon";
GRANT ALL ON TABLE "public"."estimates" TO "authenticated";
GRANT ALL ON TABLE "public"."estimates" TO "service_role";



GRANT ALL ON TABLE "public"."funnel_events" TO "anon";
GRANT ALL ON TABLE "public"."funnel_events" TO "authenticated";
GRANT ALL ON TABLE "public"."funnel_events" TO "service_role";



GRANT ALL ON TABLE "public"."inspections" TO "anon";
GRANT ALL ON TABLE "public"."inspections" TO "authenticated";
GRANT ALL ON TABLE "public"."inspections" TO "service_role";



GRANT ALL ON TABLE "public"."intake_jobs" TO "anon";
GRANT ALL ON TABLE "public"."intake_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."intake_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."interactions" TO "anon";
GRANT ALL ON TABLE "public"."interactions" TO "authenticated";
GRANT ALL ON TABLE "public"."interactions" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_items" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payment_attempts" TO "anon";
GRANT ALL ON TABLE "public"."payment_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."payouts" TO "anon";
GRANT ALL ON TABLE "public"."payouts" TO "authenticated";
GRANT ALL ON TABLE "public"."payouts" TO "service_role";



GRANT ALL ON TABLE "public"."pickup_photos" TO "anon";
GRANT ALL ON TABLE "public"."pickup_photos" TO "authenticated";
GRANT ALL ON TABLE "public"."pickup_photos" TO "service_role";



GRANT ALL ON TABLE "public"."pickup_request_items" TO "anon";
GRANT ALL ON TABLE "public"."pickup_request_items" TO "authenticated";
GRANT ALL ON TABLE "public"."pickup_request_items" TO "service_role";



GRANT ALL ON TABLE "public"."pickup_requests" TO "anon";
GRANT ALL ON TABLE "public"."pickup_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."pickup_requests" TO "service_role";



GRANT ALL ON TABLE "public"."platform_settings" TO "anon";
GRANT ALL ON TABLE "public"."platform_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";



GRANT ALL ON TABLE "public"."portal_users" TO "anon";
GRANT ALL ON TABLE "public"."portal_users" TO "authenticated";
GRANT ALL ON TABLE "public"."portal_users" TO "service_role";



GRANT ALL ON TABLE "public"."price_overrides" TO "anon";
GRANT ALL ON TABLE "public"."price_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."price_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."rug_services" TO "anon";
GRANT ALL ON TABLE "public"."rug_services" TO "authenticated";
GRANT ALL ON TABLE "public"."rug_services" TO "service_role";



GRANT ALL ON TABLE "public"."rugs" TO "anon";
GRANT ALL ON TABLE "public"."rugs" TO "authenticated";
GRANT ALL ON TABLE "public"."rugs" TO "service_role";



GRANT ALL ON TABLE "public"."service_completions" TO "anon";
GRANT ALL ON TABLE "public"."service_completions" TO "authenticated";
GRANT ALL ON TABLE "public"."service_completions" TO "service_role";



GRANT ALL ON TABLE "public"."service_prices" TO "anon";
GRANT ALL ON TABLE "public"."service_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."service_prices" TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON TABLE "public"."token_validation_attempts" TO "anon";
GRANT ALL ON TABLE "public"."token_validation_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."token_validation_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































drop extension if exists "pg_net";

revoke delete on table "public"."companies" from "anon";

revoke insert on table "public"."companies" from "anon";

revoke references on table "public"."companies" from "anon";

revoke select on table "public"."companies" from "anon";

revoke trigger on table "public"."companies" from "anon";

revoke truncate on table "public"."companies" from "anon";

revoke update on table "public"."companies" from "anon";

revoke delete on table "public"."company_branding" from "anon";

revoke insert on table "public"."company_branding" from "anon";

revoke references on table "public"."company_branding" from "anon";

revoke select on table "public"."company_branding" from "anon";

revoke trigger on table "public"."company_branding" from "anon";

revoke truncate on table "public"."company_branding" from "anon";

revoke update on table "public"."company_branding" from "anon";

revoke delete on table "public"."company_memberships" from "anon";

revoke insert on table "public"."company_memberships" from "anon";

revoke references on table "public"."company_memberships" from "anon";

revoke select on table "public"."company_memberships" from "anon";

revoke trigger on table "public"."company_memberships" from "anon";

revoke truncate on table "public"."company_memberships" from "anon";

revoke update on table "public"."company_memberships" from "anon";

revoke delete on table "public"."company_service_prices" from "anon";

revoke insert on table "public"."company_service_prices" from "anon";

revoke references on table "public"."company_service_prices" from "anon";

revoke select on table "public"."company_service_prices" from "anon";

revoke trigger on table "public"."company_service_prices" from "anon";

revoke truncate on table "public"."company_service_prices" from "anon";

revoke update on table "public"."company_service_prices" from "anon";

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER on_auth_user_created_assign_role AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

CREATE TRIGGER on_auth_user_created_role AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();


  create policy "Allow training deletes for authenticated users"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'rug-photos'::text) AND ((storage.foldername(name))[1] = 'training'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Allow training reads for authenticated users"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'rug-photos'::text) AND ((storage.foldername(name))[1] = 'training'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Allow training uploads for authenticated users"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'rug-photos'::text) AND ((storage.foldername(name))[1] = 'training'::text) AND (auth.role() = 'authenticated'::text)));



  create policy "Company members and clients can view photos"
  on "storage"."objects"
  as permissive
  for select
  to public
using (((bucket_id = 'rug-photos'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM (public.inspections i
     JOIN public.jobs j ON ((j.id = i.job_id)))
  WHERE (((storage.foldername(objects.name))[1] = (i.user_id)::text) AND (j.company_id = public.get_user_company_id(auth.uid()))))) OR (EXISTS ( SELECT 1
   FROM ((public.inspections i
     JOIN public.client_job_access cja ON ((cja.job_id = i.job_id)))
     JOIN public.client_accounts ca ON ((ca.id = cja.client_id)))
  WHERE ((ca.user_id = auth.uid()) AND ((storage.foldername(objects.name))[1] = (i.user_id)::text)))))));



  create policy "Users can delete their own rug photos"
  on "storage"."objects"
  as permissive
  for delete
  to public
using (((bucket_id = 'rug-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can update their own rug photos"
  on "storage"."objects"
  as permissive
  for update
  to public
using (((bucket_id = 'rug-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "Users can upload their own rug photos"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check (((bucket_id = 'rug-photos'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));



  create policy "checkin photos read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'checkin-photos'::text));



  create policy "checkin photos write"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'checkin-photos'::text) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'office'::public.app_role) OR public.has_role(auth.uid(), 'checkin_staff'::public.app_role))));



  create policy "pickup photos read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'pickup-photos'::text));



  create policy "pickup photos write"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'pickup-photos'::text) AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'office'::public.app_role) OR public.has_role(auth.uid(), 'driver'::public.app_role))));



