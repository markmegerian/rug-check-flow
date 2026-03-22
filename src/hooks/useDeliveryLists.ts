import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DeliveryList = {
  id: string;
  route_day: string;
  target_date: string;
  status: "compiling" | "confirmed" | "checked_out";
  confirmed_at: string | null;
  checked_out_at: string | null;
  created_at: string;
};

const DELIVERY_LISTS_KEY = ["deliveryLists"] as const;

async function fetchDeliveryLists(): Promise<DeliveryList[]> {
  const { data, error } = await supabase
    .from("delivery_lists")
    .select("*")
    .order("target_date", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as DeliveryList[];
}

export function useDeliveryLists() {
  return useQuery({
    queryKey: DELIVERY_LISTS_KEY,
    queryFn: fetchDeliveryLists,
    staleTime: 30_000,
  });
}

export function useInvalidateDeliveryLists() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: DELIVERY_LISTS_KEY });
}
