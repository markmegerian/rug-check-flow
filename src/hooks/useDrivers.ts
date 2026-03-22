import { useQuery } from "@tanstack/react-query";
import { supabaseExtended } from "@/integrations/supabase/extended";

export type DriverOption = {
  id: string;
  name: string;
};

const DRIVERS_KEY = ["drivers"] as const;

async function fetchDrivers(): Promise<DriverOption[]> {
  const { data: roleRows } = await supabaseExtended
    .from("user_roles")
    .select("user_id")
    .eq("role", "driver");

  const driverIds = [...new Set((roleRows ?? []).map((r) => r.user_id))].filter(Boolean);
  if (driverIds.length === 0) return [];

  const { data: profiles } = await supabaseExtended
    .from("profiles")
    .select("user_id, full_name, email")
    .in("user_id", driverIds);

  return (profiles ?? []).map((p) => ({
    id: p.user_id,
    name: (p.full_name as string)?.trim() || (p.email as string) || p.user_id,
  }));
}

export function useDrivers() {
  return useQuery({
    queryKey: DRIVERS_KEY,
    queryFn: fetchDrivers,
    staleTime: 60_000,
  });
}
