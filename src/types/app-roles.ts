import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  office: "Office",
  checkin_staff: "Check-In",
  driver: "Driver",
};
