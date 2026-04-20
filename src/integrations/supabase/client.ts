import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  "https://toitgmaeuscrdwbpntda.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvaXRnbWFldXNjcmR3YnBudGRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjMzOTksImV4cCI6MjA4Njc5OTM5OX0.HmWokm-8GjME-2tBoE9JXyvaIoJwiOJlsdiDkp6Qa6M";

const browserStorage = typeof localStorage !== "undefined" ? localStorage : undefined;

export { SUPABASE_URL };

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: browserStorage,
    persistSession: Boolean(browserStorage),
    autoRefreshToken: Boolean(browserStorage),
  }
});
