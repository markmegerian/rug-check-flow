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

export type PickupRequestsPage = {
  rows: PickupRequestRow[];
  total: number;
};

export type PickupRequestCounts = Record<"all" | "pending" | "confirmed" | "assigned" | "completed" | "cancelled", number>;

/** Fetch pickup requests with client names and optional status filter */
async function fetchPickupRequests(
  {
    statuses,
    page,
    pageSize,
    updatedBefore,
  }: {
    statuses?: string[];
    page: number;
    pageSize: number;
    updatedBefore?: string;
  }
): Promise<PickupRequestsPage> {
  let query = supabaseExtended
    .from("pickup_requests")
    .select("*, clients(name)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .order("scheduled_date", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses as ("pending" | "confirmed" | "assigned" | "completed" | "cancelled")[]);
  }

  if (updatedBefore) {
    query = query.lte("updated_at", updatedBefore);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    rows: (data ?? []) as unknown as PickupRequestRow[],
    total: count ?? 0,
  };
}

async function fetchPickupRequestCounts(): Promise<PickupRequestCounts> {
  const statuses: Array<keyof Omit<PickupRequestCounts, "all">> = ["pending", "confirmed", "assigned", "completed", "cancelled"];
  const results = await Promise.all([
    supabaseExtended.from("pickup_requests").select("id", { count: "exact", head: true }),
    ...statuses.map((status) =>
      supabaseExtended.from("pickup_requests").select("id", { count: "exact", head: true }).eq("status", status),
    ),
  ]);

  const [allResult, ...statusResults] = results;
  if (allResult.error) throw allResult.error;

  const counts: PickupRequestCounts = {
    all: allResult.count ?? 0,
    pending: 0,
    confirmed: 0,
    assigned: 0,
    completed: 0,
    cancelled: 0,
  };

  statusResults.forEach((result, index) => {
    if (result.error) throw result.error;
    counts[statuses[index]] = result.count ?? 0;
  });

  return counts;
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

export function usePickupRequests({
  statuses,
  page,
  pageSize,
  updatedBefore,
}: {
  statuses?: string[];
  page: number;
  pageSize: number;
  updatedBefore?: string;
}) {
  return useQuery({
    queryKey: [...PICKUP_REQUESTS_KEY, "page", statuses ?? "all", page, pageSize, updatedBefore ?? null],
    queryFn: () => fetchPickupRequests({ statuses, page, pageSize, updatedBefore }),
    staleTime: 15_000,
  });
}

export function usePickupRequestCounts() {
  return useQuery({
    queryKey: [...PICKUP_REQUESTS_KEY, "counts"],
    queryFn: fetchPickupRequestCounts,
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
