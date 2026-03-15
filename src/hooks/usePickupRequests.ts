import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseExtended } from "@/integrations/supabase/extended";
import type { ExtendedTableRow } from "@/integrations/supabase/extended";

export type PickupRequestRow = ExtendedTableRow<"pickup_requests">;

const PICKUP_REQUESTS_KEY = ["pickupRequests"] as const;

/** Fetch pickup requests with optional status filter */
async function fetchPickupRequests(
  statuses?: string[]
): Promise<PickupRequestRow[]> {
  let query = supabaseExtended
    .from("pickup_requests")
    .select("*")
    .order("scheduled_date", { ascending: true });

  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PickupRequestRow[];
}

export function usePickupRequests(statuses?: string[]) {
  return useQuery({
    queryKey: [...PICKUP_REQUESTS_KEY, statuses ?? "all"],
    queryFn: () => fetchPickupRequests(statuses),
    staleTime: 15_000,
  });
}

export function useInvalidatePickupRequests() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: PICKUP_REQUESTS_KEY });
}
