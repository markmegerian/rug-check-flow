import { supabaseExtended } from "@/integrations/supabase/extended";

export type DeliveryRouteOverviewRow = {
  route_day: string;
  client_id: string;
  client_name: string;
  client_address: string;
  delivery_list_id: string | null;
  target_date: string | null;
  list_status: "compiling" | "confirmed" | "checked_out" | null;
  confirmed_at: string | null;
  checked_out_at: string | null;
  created_at: string | null;
  rug_count: number;
};

export async function fetchDeliveryRouteOverview(): Promise<DeliveryRouteOverviewRow[]> {
  const { data, error } = await supabaseExtended.rpc("get_delivery_route_overview", {});

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    route_day: row.route_day,
    client_id: row.client_id,
    client_name: row.client_name,
    client_address: row.client_address ?? "",
    delivery_list_id: row.delivery_list_id ?? null,
    target_date: row.target_date ?? null,
    list_status: row.list_status ?? null,
    confirmed_at: row.confirmed_at ?? null,
    checked_out_at: row.checked_out_at ?? null,
    created_at: row.created_at ?? null,
    rug_count: Number(row.rug_count ?? 0),
  }));
}
