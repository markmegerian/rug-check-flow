-- Example seed for Preview Branches only

-- Optional: clear small lookup tables first (safe for previews)
-- TRUNCATE TABLE public.categories RESTART IDENTITY CASCADE;

-- Lookup/sample data
INSERT INTO public.categories (id, name)
VALUES
  (1, 'Rugs'),
  (2, 'Decor'),
  (3, 'Vintage')
ON CONFLICT (id) DO NOTHING;

-- Sample users (if you have a user_profiles table linked to auth)
-- Note: Use fake UUIDs; previews don’t copy prod auth data.
INSERT INTO public.user_profiles (id, display_name, role)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Demo User', 'viewer'),
  ('00000000-0000-0000-0000-000000000002', 'QA Tester', 'editor')
ON CONFLICT (id) DO NOTHING;

-- Sample items
INSERT INTO public.items (id, title, category_id, price_cents, is_active)
VALUES
  (1, 'Handwoven Wool Rug', 1, 25999, true),
  (2, 'Antique Persian Rug', 1, 89999, true),
  (3, 'Brass Wall Decor', 2, 12999, true)
ON CONFLICT (id) DO NOTHING;
