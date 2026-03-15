-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admin_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  company_id uuid,
  CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id),
  CONSTRAINT admin_audit_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.ai_analysis_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  inspection_id uuid,
  feedback_type text NOT NULL CHECK (feedback_type = ANY (ARRAY['service_correction'::text, 'price_correction'::text, 'missed_issue'::text, 'false_positive'::text, 'identification_error'::text])),
  original_service_name text,
  original_price numeric,
  original_rug_identification text,
  corrected_service_name text,
  corrected_price numeric,
  corrected_identification text,
  notes text,
  rug_type text,
  rug_origin text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ai_analysis_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT ai_analysis_feedback_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id)
);
CREATE TABLE public.ai_batch_training_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_label text NOT NULL DEFAULT ('Batch '::text || to_char(now(), 'YYYY-MM-DD HH24:MI'::text)),
  photo_path text NOT NULL,
  rug_type text NOT NULL DEFAULT 'Unknown'::text,
  analysis_result text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'analyzing'::text, 'analyzed'::text, 'reviewed'::text, 'error'::text])),
  error_message text,
  corrections_applied boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_batch_training_items_pkey PRIMARY KEY (id)
);
CREATE TABLE public.approved_estimates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL UNIQUE,
  job_id uuid NOT NULL,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount numeric NOT NULL DEFAULT 0,
  approved_by_staff_at timestamp with time zone,
  approved_by_staff_user_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT approved_estimates_pkey PRIMARY KEY (id),
  CONSTRAINT approved_estimates_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id),
  CONSTRAINT approved_estimates_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id)
);
CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  user_name text NOT NULL DEFAULT 'System'::text,
  action text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id),
  CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.checkin_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  job_id uuid,
  rug_id uuid,
  storage_path text NOT NULL,
  retention_policy text NOT NULL DEFAULT 'checkin_long_term'::text,
  expires_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT checkin_photos_pkey PRIMARY KEY (id),
  CONSTRAINT checkin_photos_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT checkin_photos_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.intake_jobs(id),
  CONSTRAINT checkin_photos_rug_id_fkey FOREIGN KEY (rug_id) REFERENCES public.rugs(id),
  CONSTRAINT checkin_photos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.client_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  full_name text,
  phone text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  company_id uuid,
  CONSTRAINT client_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT client_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT client_accounts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.client_job_access (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  job_id uuid NOT NULL,
  access_token text NOT NULL UNIQUE,
  invited_email text,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone,
  email_sent_at timestamp with time zone,
  email_error text,
  first_accessed_at timestamp with time zone,
  password_set_at timestamp with time zone,
  consumed_at timestamp with time zone,
  company_id uuid,
  auth_user_id uuid,
  access_token_hash text,
  CONSTRAINT client_job_access_pkey PRIMARY KEY (id),
  CONSTRAINT client_job_access_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client_accounts(id),
  CONSTRAINT client_job_access_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id),
  CONSTRAINT client_job_access_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.client_service_selections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_job_access_id uuid NOT NULL,
  approved_estimate_id uuid NOT NULL,
  selected_services jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_selected numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT client_service_selections_pkey PRIMARY KEY (id),
  CONSTRAINT client_service_selections_client_job_access_id_fkey FOREIGN KEY (client_job_access_id) REFERENCES public.client_job_access(id),
  CONSTRAINT client_service_selections_approved_estimate_id_fkey FOREIGN KEY (approved_estimate_id) REFERENCES public.approved_estimates(id)
);
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text NOT NULL DEFAULT ''::text,
  phone text NOT NULL DEFAULT ''::text,
  email text NOT NULL DEFAULT ''::text,
  address text NOT NULL DEFAULT ''::text,
  notes text NOT NULL DEFAULT ''::text,
  pricing_tier USER-DEFINED NOT NULL DEFAULT 'standard'::pricing_tier,
  route_day text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT clients_pkey PRIMARY KEY (id)
);
CREATE TABLE public.communication_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  rug_id uuid,
  estimate_id uuid,
  invoice_id uuid,
  channel USER-DEFINED NOT NULL DEFAULT 'email'::communication_channel,
  direction USER-DEFINED NOT NULL DEFAULT 'outbound'::communication_direction,
  subject text NOT NULL DEFAULT ''::text,
  body text NOT NULL DEFAULT ''::text,
  sent_to text,
  event_type text NOT NULL DEFAULT 'general'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT communication_events_pkey PRIMARY KEY (id),
  CONSTRAINT communication_events_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT communication_events_rug_id_fkey FOREIGN KEY (rug_id) REFERENCES public.rugs(id),
  CONSTRAINT communication_events_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id),
  CONSTRAINT communication_events_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
  CONSTRAINT communication_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.companies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  subscription_status text NOT NULL DEFAULT 'active'::text,
  payment_account_connected boolean NOT NULL DEFAULT false,
  stripe_account_id text,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  plan_tier USER-DEFINED NOT NULL DEFAULT 'starter'::plan_tier,
  billing_status USER-DEFINED NOT NULL DEFAULT 'trialing'::billing_status,
  trial_ends_at timestamp with time zone DEFAULT (now() + '14 days'::interval),
  max_staff_users integer NOT NULL DEFAULT 2,
  CONSTRAINT companies_pkey PRIMARY KEY (id)
);
CREATE TABLE public.company_branding (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE,
  business_name text,
  business_email text,
  business_phone text,
  business_address text,
  logo_path text,
  logo_url text,
  primary_color text DEFAULT '#3b82f6'::text,
  secondary_color text DEFAULT '#1e40af'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT company_branding_pkey PRIMARY KEY (id),
  CONSTRAINT company_branding_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.company_enabled_services (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  service_name text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT company_enabled_services_pkey PRIMARY KEY (id),
  CONSTRAINT company_enabled_services_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.company_memberships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role USER-DEFINED NOT NULL DEFAULT 'staff'::company_role,
  invited_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT company_memberships_pkey PRIMARY KEY (id),
  CONSTRAINT company_memberships_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.company_service_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  service_name text NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_additional boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT company_service_prices_pkey PRIMARY KEY (id),
  CONSTRAINT company_service_prices_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.credit_memo_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  credit_memo_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  description text NOT NULL DEFAULT ''::text,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT credit_memo_lines_pkey PRIMARY KEY (id),
  CONSTRAINT credit_memo_lines_credit_memo_id_fkey FOREIGN KEY (credit_memo_id) REFERENCES public.credit_memos(id),
  CONSTRAINT credit_memo_lines_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id)
);
CREATE TABLE public.credit_memos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  memo_number text UNIQUE,
  status text NOT NULL DEFAULT 'issued'::text CHECK (status = ANY (ARRAY['draft'::text, 'issued'::text, 'void'::text])),
  issued_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT credit_memos_pkey PRIMARY KEY (id),
  CONSTRAINT credit_memos_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT credit_memos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.declined_services (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  inspection_id uuid NOT NULL,
  service_id text NOT NULL,
  service_name text NOT NULL,
  service_category text NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 1,
  declined_amount numeric NOT NULL DEFAULT 0,
  decline_consequence text,
  acknowledged_at timestamp with time zone NOT NULL DEFAULT now(),
  acknowledged_by_client_id uuid,
  restored_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT declined_services_pkey PRIMARY KEY (id),
  CONSTRAINT declined_services_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id),
  CONSTRAINT declined_services_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id),
  CONSTRAINT declined_services_acknowledged_by_client_id_fkey FOREIGN KEY (acknowledged_by_client_id) REFERENCES public.client_accounts(id)
);
CREATE TABLE public.delivery_list_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  delivery_list_id uuid NOT NULL,
  rug_id uuid NOT NULL,
  client_id uuid,
  confirmed_for_delivery boolean NOT NULL DEFAULT false,
  loaded_on_truck boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT delivery_list_items_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_list_items_delivery_list_id_fkey FOREIGN KEY (delivery_list_id) REFERENCES public.delivery_lists(id),
  CONSTRAINT delivery_list_items_rug_id_fkey FOREIGN KEY (rug_id) REFERENCES public.rugs(id),
  CONSTRAINT delivery_list_items_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.delivery_lists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  route_day text NOT NULL DEFAULT ''::text,
  target_date date NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'compiling'::delivery_list_status,
  compiled_by uuid,
  confirmed_at timestamp with time zone,
  checked_out_by uuid,
  checked_out_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT delivery_lists_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_lists_compiled_by_fkey FOREIGN KEY (compiled_by) REFERENCES auth.users(id),
  CONSTRAINT delivery_lists_checked_out_by_fkey FOREIGN KEY (checked_out_by) REFERENCES auth.users(id)
);
CREATE TABLE public.disputes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rug_id uuid NOT NULL,
  client_id uuid NOT NULL,
  type USER-DEFINED NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'open'::dispute_status,
  notes text NOT NULL DEFAULT ''::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT disputes_pkey PRIMARY KEY (id),
  CONSTRAINT disputes_rug_id_fkey FOREIGN KEY (rug_id) REFERENCES public.rugs(id),
  CONSTRAINT disputes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT disputes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.email_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_type text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  company_id uuid,
  CONSTRAINT email_templates_pkey PRIMARY KEY (id),
  CONSTRAINT email_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.estimate_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL,
  rug_service_id uuid,
  description text NOT NULL DEFAULT ''::text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  client_approved boolean,
  client_decision_at timestamp with time zone,
  service_category text NOT NULL DEFAULT ''::text,
  CONSTRAINT estimate_items_pkey PRIMARY KEY (id),
  CONSTRAINT estimate_items_estimate_id_fkey FOREIGN KEY (estimate_id) REFERENCES public.estimates(id),
  CONSTRAINT estimate_items_rug_service_id_fkey FOREIGN KEY (rug_service_id) REFERENCES public.rug_services(id)
);
CREATE TABLE public.estimates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rug_id uuid NOT NULL,
  client_id uuid,
  estimate_number text NOT NULL UNIQUE,
  status USER-DEFINED NOT NULL DEFAULT 'draft'::estimate_status,
  version integer NOT NULL DEFAULT 1,
  total numeric NOT NULL DEFAULT 0,
  sent_at timestamp with time zone,
  approved_at timestamp with time zone,
  rejected_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT estimates_pkey PRIMARY KEY (id),
  CONSTRAINT estimates_rug_id_fkey FOREIGN KEY (rug_id) REFERENCES public.rugs(id),
  CONSTRAINT estimates_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT estimates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.funnel_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  job_id uuid,
  company_id uuid,
  actor text NOT NULL CHECK (actor = ANY (ARRAY['staff'::text, 'client'::text, 'system'::text])),
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT funnel_events_pkey PRIMARY KEY (id),
  CONSTRAINT funnel_events_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id),
  CONSTRAINT funnel_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.inspections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_name text,
  client_email text,
  client_phone text,
  rug_number text NOT NULL,
  rug_type text NOT NULL,
  length numeric,
  width numeric,
  notes text,
  photo_urls ARRAY DEFAULT '{}'::text[],
  analysis_report text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid,
  job_id uuid,
  image_annotations jsonb,
  estimate_approved boolean DEFAULT false,
  condition_flags jsonb DEFAULT '{}'::jsonb,
  system_services jsonb DEFAULT '[]'::jsonb,
  company_id uuid,
  structured_findings jsonb,
  CONSTRAINT inspections_pkey PRIMARY KEY (id),
  CONSTRAINT inspections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT inspections_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id),
  CONSTRAINT inspections_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.intake_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_code text NOT NULL UNIQUE,
  client_id uuid,
  source text NOT NULL CHECK (source = ANY (ARRAY['pickup'::text, 'dropoff'::text])),
  intake_date timestamp with time zone NOT NULL,
  checkin_date timestamp with time zone NOT NULL,
  pickup_scheduled_date date,
  pickup_request_id uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT intake_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT intake_jobs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT intake_jobs_pickup_request_id_fkey FOREIGN KEY (pickup_request_id) REFERENCES public.pickup_requests(id),
  CONSTRAINT intake_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.interactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  job_id uuid,
  rug_id uuid,
  pickup_request_id uuid,
  interaction_type text NOT NULL,
  channel text NOT NULL DEFAULT 'phone'::text,
  subject text NOT NULL DEFAULT ''::text,
  body text NOT NULL DEFAULT ''::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT interactions_pkey PRIMARY KEY (id),
  CONSTRAINT interactions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT interactions_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.intake_jobs(id),
  CONSTRAINT interactions_rug_id_fkey FOREIGN KEY (rug_id) REFERENCES public.rugs(id),
  CONSTRAINT interactions_pickup_request_id_fkey FOREIGN KEY (pickup_request_id) REFERENCES public.pickup_requests(id),
  CONSTRAINT interactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.invoice_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  rug_id uuid,
  description text NOT NULL DEFAULT ''::text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT invoice_items_pkey PRIMARY KEY (id),
  CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
  CONSTRAINT invoice_items_rug_id_fkey FOREIGN KEY (rug_id) REFERENCES public.rugs(id)
);
CREATE TABLE public.invoice_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'manual'::text,
  reference text,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT invoice_payments_pkey PRIMARY KEY (id),
  CONSTRAINT invoice_payments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT invoice_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  client_id uuid,
  delivery_list_id uuid,
  status USER-DEFINED NOT NULL DEFAULT 'draft'::invoice_status,
  total numeric NOT NULL DEFAULT 0,
  issued_at timestamp with time zone,
  due_at timestamp with time zone,
  paid_at timestamp with time zone,
  pdf_storage_path text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  balance numeric NOT NULL DEFAULT 0,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT invoices_delivery_list_id_fkey FOREIGN KEY (delivery_list_id) REFERENCES public.delivery_lists(id)
);
CREATE TABLE public.jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_number text NOT NULL,
  client_name text NOT NULL,
  client_email text,
  client_phone text,
  notes text,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  client_portal_enabled boolean DEFAULT false,
  all_estimates_approved boolean DEFAULT false,
  client_approved_at timestamp with time zone,
  payment_status text DEFAULT 'pending'::text,
  last_activity_at timestamp with time zone DEFAULT now(),
  next_follow_up_at timestamp with time zone,
  follow_up_notes text,
  company_id uuid,
  CONSTRAINT jobs_pkey PRIMARY KEY (id),
  CONSTRAINT jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT jobs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.message_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  thread_type USER-DEFINED NOT NULL,
  entity_id uuid,
  status USER-DEFINED NOT NULL DEFAULT 'active'::thread_status,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT message_threads_pkey PRIMARY KEY (id),
  CONSTRAINT message_threads_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  sender uuid,
  body text NOT NULL DEFAULT ''::text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.message_threads(id)
);
CREATE TABLE public.notification_cadence (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  notification_type text NOT NULL,
  scheduled_for timestamp with time zone NOT NULL,
  sent_at timestamp with time zone,
  throttle_key text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_cadence_pkey PRIMARY KEY (id),
  CONSTRAINT notification_cadence_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.notification_throttles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  throttle_key text NOT NULL,
  last_sent_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_throttles_pkey PRIMARY KEY (id),
  CONSTRAINT notification_throttles_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);
CREATE TABLE public.payment_allocations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payment_allocations_pkey PRIMARY KEY (id),
  CONSTRAINT payment_allocations_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
  CONSTRAINT payment_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.payments(id)
);
CREATE TABLE public.payment_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  client_id uuid,
  provider text NOT NULL DEFAULT 'stripe'::text,
  provider_payment_ref text,
  amount numeric NOT NULL DEFAULT 0,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::payment_attempt_status,
  attempted_at timestamp with time zone NOT NULL DEFAULT now(),
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT payment_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT payment_attempts_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
  CONSTRAINT payment_attempts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  client_id uuid,
  stripe_payment_intent_id text UNIQUE,
  stripe_checkout_session_id text UNIQUE,
  amount numeric NOT NULL,
  currency text DEFAULT 'usd'::text,
  status text NOT NULL DEFAULT 'pending'::text,
  paid_at timestamp with time zone,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  platform_fee numeric DEFAULT 0,
  method text NOT NULL DEFAULT 'manual'::text,
  reference text,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id),
  CONSTRAINT payments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.client_accounts(id)
);
CREATE TABLE public.payouts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  payment_method text,
  reference_number text,
  notes text,
  period_start date,
  period_end date,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  paid_at timestamp with time zone,
  created_by uuid,
  gross_revenue numeric DEFAULT 0,
  platform_fees_deducted numeric DEFAULT 0,
  company_id uuid,
  CONSTRAINT payouts_pkey PRIMARY KEY (id),
  CONSTRAINT payouts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id)
);
CREATE TABLE public.pickup_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pickup_request_id uuid,
  pickup_item_id uuid,
  client_id uuid,
  storage_path text NOT NULL,
  retention_policy text NOT NULL DEFAULT 'pickup_short_term'::text,
  expires_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pickup_photos_pkey PRIMARY KEY (id),
  CONSTRAINT pickup_photos_pickup_request_id_fkey FOREIGN KEY (pickup_request_id) REFERENCES public.pickup_requests(id),
  CONSTRAINT pickup_photos_pickup_item_id_fkey FOREIGN KEY (pickup_item_id) REFERENCES public.pickup_request_items(id),
  CONSTRAINT pickup_photos_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT pickup_photos_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.pickup_request_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  pickup_request_id uuid NOT NULL,
  rug_id uuid,
  rug_number text NOT NULL,
  rug_type text NOT NULL DEFAULT ''::text,
  length numeric,
  width numeric,
  is_new boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  verified boolean NOT NULL DEFAULT false,
  driver_notes text NOT NULL DEFAULT ''::text,
  driver_photo_urls ARRAY NOT NULL DEFAULT '{}'::text[],
  checked_in_rug_id uuid,
  estimate_requested boolean NOT NULL DEFAULT false,
  estimate_request_details text,
  CONSTRAINT pickup_request_items_pkey PRIMARY KEY (id),
  CONSTRAINT pickup_request_items_pickup_request_id_fkey FOREIGN KEY (pickup_request_id) REFERENCES public.pickup_requests(id),
  CONSTRAINT pickup_request_items_rug_id_fkey FOREIGN KEY (rug_id) REFERENCES public.rugs(id),
  CONSTRAINT pickup_request_items_checked_in_rug_id_fkey FOREIGN KEY (checked_in_rug_id) REFERENCES public.rugs(id)
);
CREATE TABLE public.pickup_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  route_day text NOT NULL DEFAULT ''::text,
  scheduled_date date NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::pickup_request_status,
  notes text NOT NULL DEFAULT ''::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  assigned_driver_id uuid,
  assigned_at timestamp with time zone,
  completed_at timestamp with time zone,
  signature_data_url text,
  CONSTRAINT pickup_requests_pkey PRIMARY KEY (id),
  CONSTRAINT pickup_requests_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT pickup_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT pickup_requests_assigned_driver_id_fkey FOREIGN KEY (assigned_driver_id) REFERENCES auth.users(id)
);
CREATE TABLE public.platform_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  setting_key text NOT NULL UNIQUE,
  setting_value text NOT NULL,
  description text,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  CONSTRAINT platform_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.portal_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'invited'::text CHECK (status = ANY (ARRAY['active'::text, 'invited'::text])),
  onboarding_completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  must_change_password boolean NOT NULL DEFAULT true,
  CONSTRAINT portal_users_pkey PRIMARY KEY (id),
  CONSTRAINT portal_users_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.price_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  inspection_id uuid,
  job_id uuid,
  service_id text NOT NULL,
  service_name text NOT NULL,
  original_price numeric NOT NULL,
  adjusted_price numeric NOT NULL,
  override_reason text NOT NULL,
  override_notes text,
  overridden_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT price_overrides_pkey PRIMARY KEY (id),
  CONSTRAINT price_overrides_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.inspections(id),
  CONSTRAINT price_overrides_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  business_name text,
  business_address text,
  business_phone text,
  business_email text,
  logo_url text,
  payment_method text DEFAULT 'bank_transfer'::text,
  bank_name text,
  bank_account_number text,
  bank_routing_number text,
  paypal_email text,
  venmo_handle text,
  zelle_email text,
  payment_notes text,
  notification_preferences jsonb DEFAULT '{"jobUpdates": true, "emailReports": true, "marketingEmails": false}'::jsonb,
  logo_path text,
  email text NOT NULL DEFAULT ''::text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.push_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL CHECK (platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])),
  device_info jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT push_tokens_pkey PRIMARY KEY (id)
);
CREATE TABLE public.rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  action text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT rate_limits_pkey PRIMARY KEY (id)
);
CREATE TABLE public.route_stop_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  offline_event_id uuid NOT NULL UNIQUE,
  route_stop_id uuid NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT route_stop_events_pkey PRIMARY KEY (id),
  CONSTRAINT route_stop_events_route_stop_id_fkey FOREIGN KEY (route_stop_id) REFERENCES public.route_stops(id),
  CONSTRAINT route_stop_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.route_stop_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  route_stop_id uuid NOT NULL,
  phase USER-DEFINED NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'pending'::route_stop_item_status,
  rug_id uuid,
  pickup_request_item_id uuid,
  delivery_list_item_id uuid,
  notes text NOT NULL DEFAULT ''::text,
  photo_urls ARRAY NOT NULL DEFAULT '{}'::text[],
  exception_code text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT route_stop_items_pkey PRIMARY KEY (id),
  CONSTRAINT route_stop_items_delivery_list_item_id_fkey FOREIGN KEY (delivery_list_item_id) REFERENCES public.delivery_list_items(id),
  CONSTRAINT route_stop_items_route_stop_id_fkey FOREIGN KEY (route_stop_id) REFERENCES public.route_stops(id),
  CONSTRAINT route_stop_items_rug_id_fkey FOREIGN KEY (rug_id) REFERENCES public.rugs(id),
  CONSTRAINT route_stop_items_pickup_request_item_id_fkey FOREIGN KEY (pickup_request_item_id) REFERENCES public.pickup_request_items(id)
);
CREATE TABLE public.route_stops (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  route_date date NOT NULL,
  client_id uuid NOT NULL,
  route_day text NOT NULL DEFAULT ''::text,
  assigned_driver_id uuid,
  delivery_list_id uuid,
  pickup_request_id uuid,
  status USER-DEFINED NOT NULL DEFAULT 'queued'::route_stop_status,
  signature_data_url text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  exception_code text,
  notes text NOT NULL DEFAULT ''::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT route_stops_pkey PRIMARY KEY (id),
  CONSTRAINT route_stops_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT route_stops_delivery_list_id_fkey FOREIGN KEY (delivery_list_id) REFERENCES public.delivery_lists(id),
  CONSTRAINT route_stops_pickup_request_id_fkey FOREIGN KEY (pickup_request_id) REFERENCES public.pickup_requests(id),
  CONSTRAINT route_stops_assigned_driver_id_fkey FOREIGN KEY (assigned_driver_id) REFERENCES auth.users(id)
);
CREATE TABLE public.rug_services (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  rug_id uuid NOT NULL,
  service_id uuid,
  service_name text NOT NULL DEFAULT ''::text,
  unit_price numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  edges ARRAY NOT NULL DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT rug_services_pkey PRIMARY KEY (id),
  CONSTRAINT rug_services_rug_id_fkey FOREIGN KEY (rug_id) REFERENCES public.rugs(id),
  CONSTRAINT rug_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id)
);
CREATE TABLE public.rugs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tag text NOT NULL UNIQUE,
  client_id uuid,
  description text NOT NULL DEFAULT ''::text,
  size_length numeric,
  size_width numeric,
  photo_url text,
  status USER-DEFINED NOT NULL DEFAULT 'checked_in'::rug_status,
  services ARRAY NOT NULL DEFAULT '{}'::text[],
  notes text NOT NULL DEFAULT ''::text,
  checked_in_by uuid,
  checked_in_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  picked_up_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  job_id uuid,
  intake_source text CHECK (intake_source = ANY (ARRAY['pickup'::text, 'dropoff'::text])),
  intake_date timestamp with time zone,
  CONSTRAINT rugs_pkey PRIMARY KEY (id),
  CONSTRAINT rugs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT rugs_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES auth.users(id),
  CONSTRAINT rugs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.intake_jobs(id)
);
CREATE TABLE public.service_completions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  approved_estimate_id uuid NOT NULL,
  service_id text NOT NULL,
  completed_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_by uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT service_completions_pkey PRIMARY KEY (id),
  CONSTRAINT service_completions_approved_estimate_id_fkey FOREIGN KEY (approved_estimate_id) REFERENCES public.approved_estimates(id),
  CONSTRAINT service_completions_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.service_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  service_name text NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT service_prices_pkey PRIMARY KEY (id)
);
CREATE TABLE public.services (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  base_price numeric NOT NULL DEFAULT 0,
  preferred_price numeric NOT NULL DEFAULT 0,
  vip_price numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'per sqft'::text,
  category text NOT NULL DEFAULT ''::text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  requires_estimate boolean NOT NULL DEFAULT true,
  CONSTRAINT services_pkey PRIMARY KEY (id)
);
CREATE TABLE public.token_validation_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 1,
  first_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  last_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
  blocked_until timestamp with time zone,
  CONSTRAINT token_validation_attempts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role USER-DEFINED NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (id),
  CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
