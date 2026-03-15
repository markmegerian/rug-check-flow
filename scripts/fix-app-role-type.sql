-- Fix app_role type: add missing enum values safely
-- Run this in Supabase Dashboard > SQL Editor BEFORE running the baseline migration
-- This adds missing values to the existing app_role type instead of trying to recreate it

DO $$
DECLARE
  type_oid oid;
BEGIN
  -- Get the oid of the app_role type
  SELECT oid INTO type_oid FROM pg_type WHERE typname = 'app_role';
  
  IF type_oid IS NULL THEN
    RAISE EXCEPTION 'app_role type does not exist. Run the full migration first.';
  END IF;

  -- Add 'staff' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'staff' 
    AND enumtypid = type_oid
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'staff';
    RAISE NOTICE 'Added ''staff'' to app_role enum';
  END IF;

  -- Add 'client' if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'client' 
    AND enumtypid = type_oid
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'client';
    RAISE NOTICE 'Added ''client'' to app_role enum';
  END IF;

  -- Verify all expected values exist
  RAISE NOTICE 'app_role enum now contains: %', (
    SELECT string_agg(enumlabel, ', ' ORDER BY enumsortorder)
    FROM pg_enum
    WHERE enumtypid = type_oid
  );
END $$;

-- Show current enum values
SELECT enumlabel as value 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')
ORDER BY enumsortorder;
