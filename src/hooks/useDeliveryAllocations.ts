import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type DeliveryAllocation = {
  rug_id: string;
  delivery_list_id: string;
  target_date: string;
  status: string;
};

async function fetchDeliveryAllocations(): Promise<Map<string, DeliveryAllocation>> {
  // Get active delivery list items joined with their list metadata
  const { data, error } = await supabase
    .from("delivery_list_items")
    .select("rug_id, delivery_list_id, delivery_lists(target_date, status)")
    .returns<Array<{
      rug_id: string;
      delivery_list_id: string;
      delivery_lists: { target_date: string; status: string } | null;
    }>>();

  if (error || !data) return new Map();

  const map = new Map<string, DeliveryAllocation>();
  for (const item of data) {
    if (!item.delivery_lists) continue;
    const status = item.delivery_lists.status;
    // Only show active allocations (compiling or confirmed, not checked_out)
    if (status === "checked_out") continue;
    map.set(item.rug_id, {
      rug_id: item.rug_id,
      delivery_list_id: item.delivery_list_id,
      target_date: item.delivery_lists.target_date,
      status,
    });
  }
  return map;
}

export function useDeliveryAllocations() {
  return useQuery({
    queryKey: ["delivery-allocations"],
    queryFn: fetchDeliveryAllocations,
    staleTime: 30_000,
  });
}
