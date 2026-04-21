import { supabaseExtended } from "@/integrations/supabase/extended";

export type EstimateGroupDetailRow = {
  id: string;
  rug_id: string;
  client_id: string;
  estimate_number: string;
  status: string;
  version: number;
  total: number;
  created_at: string;
  sent_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  client_name: string | null;
  client_email: string | null;
  rug_tag: string | null;
};

export async function fetchEstimateGroupDetails(clientId: string, status: string) {
  const { data, error } = await supabaseExtended.rpc("get_estimate_group_details", {
    p_client_id: clientId,
    p_status: status,
  });

  if (error) throw error;

  return ((data ?? []) as EstimateGroupDetailRow[]).map((row) => ({
    ...row,
    total: Number(row.total ?? 0),
    version: Number(row.version ?? 1),
  }));
}
