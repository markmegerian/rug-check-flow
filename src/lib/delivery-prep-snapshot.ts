import { supabaseExtended } from "@/integrations/supabase/extended";

export type DeliveryPrepSnapshotRow = {
  delivery_list_id: string;
  route_day: string;
  target_date: string;
  list_status: "compiling" | "confirmed" | "checked_out";
  client_id: string;
  client_name: string;
  client_address: string | null;
  rug_id: string;
  rug_tag: string;
  rug_description: string | null;
  rug_status: string;
  size_length: number | null;
  size_width: number | null;
  confirmed_for_delivery: boolean;
  loaded_on_truck: boolean;
};

export async function fetchDeliveryPrepSnapshot(targetDate: string): Promise<DeliveryPrepSnapshotRow[]> {
  const { data, error } = await supabaseExtended.rpc("get_delivery_prep_snapshot", {
    p_target_date: targetDate,
  });

  if (error) throw error;
  return (data ?? []) as DeliveryPrepSnapshotRow[];
}
