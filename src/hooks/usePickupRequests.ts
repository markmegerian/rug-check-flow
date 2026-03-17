import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseExtended } from "@/integrations/supabase/extended";
import type { ExtendedTableRow } from "@/integrations/supabase/extended";

export type PickupRequestRow = ExtendedTableRow<"pickup_requests"> & {
  clients?: { name: string } | null;
};

export type PickupItemRow = {
  id: string;
  pickup_request_id: string;
  rug_number: string;
  is_new: boolean;
};

const PICKUP_REQUESTS_KEY = ["pickupRequests"] as const;

/** Fetch pickup requests with client names and optional status filter */
async function fetchPickupRequests(
  statuses?: string[]
): Promise<PickupRequestRow[]> {
  let query = supabaseExtended
    .from("pickup_requests")
    .select("*, clients(name)")
    .order("scheduled_date", { ascending: true });

  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses as any);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as PickupRequestRow[];
}

/** Fetch pickup request items for given request IDs */
async function fetchPickupItems(
  requestIds: string[]
): Promise<PickupItemRow[]> {
  if (requestIds.length === 0) return [];
  const { data, error } = await supabaseExtended
    .from("pickup_request_items")
    .select("id, pickup_request_id, rug_number, is_new")
    .in("pickup_request_id", requestIds);
  if (error) throw error;
  return (data ?? []) as PickupItemRow[];
}

export function usePickupRequests(statuses?: string[]) {
  return useQuery({
    queryKey: [...PICKUP_REQUESTS_KEY, statuses ?? "all"],
    queryFn: () => fetchPickupRequests(statuses),
    staleTime: 15_000,
  });
}

export function usePickupItems(requestIds: string[]) {
  return useQuery({
    queryKey: [...PICKUP_REQUESTS_KEY, "items", requestIds],
    queryFn: () => fetchPickupItems(requestIds),
    enabled: requestIds.length > 0,
    staleTime: 15_000,
  });
}

export function useInvalidatePickupRequests() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: PICKUP_REQUESTS_KEY });
}
