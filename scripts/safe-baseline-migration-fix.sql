-- Safe wrapper for baseline migration CREATE TYPE statements
-- If you're getting "type already exists" errors, run this BEFORE the baseline migration
-- This ensures all enum types exist with the correct values

-- app_role: add missing values if type exists, or skip if you'll create it in migration
DO $$
BEGIN
  -- Only add values if type exists (don't create the type here)
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    -- Add missing values
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'staff' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')) THEN
      ALTER TYPE public.app_role ADD VALUE 'staff';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'client' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')) THEN
      ALTER TYPE public.app_role ADD VALUE 'client';
    END IF;
    RAISE NOTICE 'app_role type exists - added missing values if needed';
  ELSE
    RAISE NOTICE 'app_role type does not exist - will be created by migration';
  END IF;
END $$;

-- If you're running the baseline migration and getting errors, you can:
-- 1. Comment out the CREATE TYPE lines for types that already exist
-- 2. Or run this script first to add missing enum values
-- 3. Then modify the baseline migration to use CREATE TYPE IF NOT EXISTS (but that doesn't work for ENUMs)

-- Better solution: Mark the baseline migration as already applied if your schema matches
-- Run: supabase migration repair --status applied 20260228055325
