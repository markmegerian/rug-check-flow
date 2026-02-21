-- Add category column to services
ALTER TABLE public.services ADD COLUMN category text NOT NULL DEFAULT 'Cleaning';

-- Assign categories to existing services
UPDATE public.services SET category = 'Cleaning' WHERE name IN ('Standard Wash', 'Deep Wash', 'Pet Stain Treatment', 'Odor Removal');
UPDATE public.services SET category = 'Repair' WHERE name IN ('Fringe Repair', 'Edge Binding', 'Patch Repair');
UPDATE public.services SET category = 'Protection' WHERE name IN ('Scotchgard', 'Moth Proofing');
UPDATE public.services SET category = 'Specialty' WHERE name IN ('Silk Treatment', 'Antique Restoration', 'Blocking', 'Padding');