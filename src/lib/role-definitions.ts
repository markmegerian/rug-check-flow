import type { Tables } from "@/integrations/supabase/types";

export type AppRole = Tables<"user_roles">["role"];

export type RoleDefinition = {
  id: AppRole;
  name: string;
  description: string;
};

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  { id: "admin", name: "admin", description: "Full system access" },
  { id: "office", name: "office", description: "Office & billing access" },
  { id: "checkin_staff", name: "checkin_staff", description: "Check-in only" },
  { id: "driver", name: "driver", description: "Driver portal only" },
];
