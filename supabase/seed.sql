-- Preview-only seed data
-- Safe to re-run due to ON CONFLICT and fixed UUIDs

-- Helpers
-- Use fixed UUIDs so other rows can reference them
-- Companies
WITH c AS (
  SELECT '11111111-1111-1111-1111-111111111111'::uuid AS company_id
)
INSERT INTO public.companies (id, name, slug, subscription_status, plan_tier, billing_status, max_staff_users)
SELECT company_id, 'Demo Rugs Co', 'demo-rugs', 'active', 'starter', 'trialing', 5 FROM c
ON CONFLICT (id) DO NOTHING;

-- Company branding
INSERT INTO public.company_branding (id, company_id, business_name, business_email, business_phone, business_address)
VALUES (
  '11111111-1111-1111-1111-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Demo Rugs Co',
  'hello@demorugs.example',
  '+1-555-0100',
  '123 Demo St, Demo City, DC'
)
ON CONFLICT (company_id) DO NOTHING;

-- Services catalog (shared)
INSERT INTO public.services (id, name, base_price, preferred_price, vip_price, unit, category, sort_order, active, requires_estimate)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Basic Wash', 2.00, 1.75, 1.50, 'per sqft', 'cleaning', 1, true, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Deep Clean', 3.50, 3.00, 2.50, 'per sqft', 'cleaning', 2, true, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Pet Odor Treatment', 1.50, 1.25, 1.00, 'per sqft', 'treatment', 3, true, true)
ON CONFLICT (id) DO NOTHING;

-- A demo client
INSERT INTO public.clients (id, name, contact_name, phone, email, address, pricing_tier, route_day)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Acme Interiors',
  'Casey Client',
  '+1-555-0101',
  'client@acme.example',
  '789 Client Ave, Clienttown, CT',
  'standard',
  'monday'
)
ON CONFLICT (id) DO NOTHING;

-- A demo intake job (used as parent for rugs and interactions)
INSERT INTO public.intake_jobs (id, job_code, client_id, source, intake_date, checkin_date)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  'JOB-1001',
  '22222222-2222-2222-2222-222222222222',
  'dropoff',
  now() - interval '3 days',
  now() - interval '3 days'
)
ON CONFLICT (id) DO NOTHING;

-- A few rugs for the client
INSERT INTO public.rugs (id, tag, client_id, description, size_length, size_width, status, notes, job_id, intake_source, intake_date)
VALUES
  ('44444444-4444-4444-4444-444444444444', 'RUG-0001', '22222222-2222-2222-2222-222222222222',
    'Persian wool rug, red/blue', 10, 8, 'checked_in', 'Small fringe wear', '33333333-3333-3333-3333-333333333333', 'dropoff', now() - interval '3 days'),
  ('44444444-4444-4444-4444-444444444445', 'RUG-0002', '22222222-2222-2222-2222-222222222222',
    'Modern synthetic rug, gray', 12, 9, 'checked_in', '', '33333333-3333-3333-3333-333333333333', 'dropoff', now() - interval '3 days')
ON CONFLICT (tag) DO NOTHING;

-- A demo staff-owned job and inspection flow
-- Ensure deterministic auth users exist for FK-constrained seed rows
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '10111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'staff.demo@demorugs.example',
    crypt('preview-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"seeded":true,"role":"staff"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20222222-2222-2222-2222-222222222222',
    'authenticated',
    'authenticated',
    'client.portal@acme.example',
    crypt('preview-password', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"seeded":true,"role":"client"}',
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.jobs (id, user_id, job_number, client_name, client_email, client_phone, status, company_id, last_activity_at)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  '10111111-1111-1111-1111-111111111111',
  'J-2001',
  'Acme Interiors',
  'client@acme.example',
  '+1-555-0101',
  'active',
  '11111111-1111-1111-1111-111111111111',
  now()
)
ON CONFLICT (id) DO NOTHING;

-- Inspection linked to a rug and the job
INSERT INTO public.inspections (id, rug_number, rug_type, length, width, notes, photo_urls, analysis_report, user_id, job_id, estimate_approved, company_id)
VALUES (
  '66666666-6666-6666-6666-666666666666',
  'RUG-0001',
  'Persian',
  10, 8,
  'Visible pet odor; recommend deep clean + odor treatment',
  ARRAY['https://example.com/photo1.jpg','https://example.com/photo2.jpg'],
  'System analysis: likely wool; moderate soiling',
  NULL, -- user_id optional for seed
  '55555555-5555-5555-5555-555555555555',
  false,
  '11111111-1111-1111-1111-111111111111'
)
ON CONFLICT (id) DO NOTHING;

-- Estimate for the rug
INSERT INTO public.estimates (id, rug_id, client_id, estimate_number, status, version, total, created_by)
VALUES (
  '77777777-7777-7777-7777-777777777777',
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222',
  'EST-1001',
  'sent',
  1,
  0,
  NULL
)
ON CONFLICT (estimate_number) DO NOTHING;

-- Estimate line items (linked to services)
INSERT INTO public.estimate_items (id, estimate_id, description, quantity, unit_price, total, service_category)
VALUES
  ('77777777-7777-7777-7777-777777777771', '77777777-7777-7777-7777-777777777777',
    'Deep Clean (10x8 = 80 sqft)', 80, 3.5, 280, 'cleaning'),
  ('77777777-7777-7777-7777-777777777772', '77777777-7777-7777-7777-777777777777',
    'Pet Odor Treatment (80 sqft)', 80, 1.5, 120, 'treatment')
ON CONFLICT (id) DO NOTHING;

-- Mark the estimate total
UPDATE public.estimates
SET total = 400
WHERE id = '77777777-7777-7777-7777-777777777777';

-- Approved estimate record for job
INSERT INTO public.approved_estimates (id, inspection_id, job_id, services, total_amount)
VALUES (
  '88888888-8888-8888-8888-888888888888',
  '66666666-6666-6666-6666-666666666666',
  '55555555-5555-5555-5555-555555555555',
  jsonb_build_array(
    jsonb_build_object('name','Deep Clean','qty',80,'unit_price',3.5,'total',280),
    jsonb_build_object('name','Pet Odor Treatment','qty',80,'unit_price',1.5,'total',120)
  ),
  400
)
ON CONFLICT (inspection_id) DO NOTHING;

-- Portal account record tied to auth.users for client_job_access FK
INSERT INTO public.client_accounts (id, user_id, email, full_name, phone, company_id)
VALUES (
  '22333333-3333-3333-3333-333333333333',
  '20222222-2222-2222-2222-222222222222',
  'client.portal@acme.example',
  'Casey Client',
  '+1-555-0101',
  '11111111-1111-1111-1111-111111111111'
)
ON CONFLICT (id) DO NOTHING;

-- Client portal access (token-only style)
INSERT INTO public.client_job_access (id, client_id, job_id, access_token, company_id)
VALUES (
  '99999999-9999-9999-9999-999999999999',
  '22333333-3333-3333-3333-333333333333',
  '55555555-5555-5555-5555-555555555555',
  'demo-access-token',
  '11111111-1111-1111-1111-111111111111'
)
ON CONFLICT (access_token) DO NOTHING;

-- Invoices (draft)
INSERT INTO public.invoices (id, invoice_number, client_id, status, total, total_amount, balance_due)
VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeffffffff',
  'INV-1001',
  '22222222-2222-2222-2222-222222222222',
  'draft',
  400,
  400,
  400
)
ON CONFLICT (invoice_number) DO NOTHING;

INSERT INTO public.invoice_items (id, invoice_id, rug_id, description, quantity, unit_price, total)
VALUES (
  'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeffffffff',
  '44444444-4444-4444-4444-444444444444',
  'Deep Clean (80 sqft) + Pet Odor Treatment (80 sqft)',
  1,
  400,
  400
)
ON CONFLICT (id) DO NOTHING;

-- Notifications sample
INSERT INTO public.notifications (id, user_id, type, title, message, read)
VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', gen_random_uuid(), 'system', 'Welcome', 'Your preview environment is ready', false),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2', gen_random_uuid(), 'job_update', 'Estimate Sent', 'We sent an estimate to the client', false)
ON CONFLICT (id) DO NOTHING;

-- Minimal communication event
INSERT INTO public.communication_events (id, client_id, channel, direction, subject, body, event_type, created_by)
VALUES (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  '22222222-2222-2222-2222-222222222222',
  'email', 'outbound',
  'Estimate EST-1001',
  'Please review your estimate.',
  'estimate_sent',
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- Route/delivery scaffolding (optional demo)
INSERT INTO public.delivery_lists (id, route_day, target_date, status)
VALUES (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'monday',
  current_date + 1,
  'compiling'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.delivery_list_items (id, delivery_list_id, rug_id, client_id, confirmed_for_delivery, loaded_on_truck)
VALUES (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222',
  false,
  false
)
ON CONFLICT (id) DO NOTHING;
