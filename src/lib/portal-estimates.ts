import { supabaseExtended } from "@/integrations/supabase/extended";
import type { EstimateStatus } from "@/lib/workflow-guards";

export type PortalEstimateItemRow = {
  id: string;
  estimate_id: string;
  rug_service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  client_approved: boolean | null;
  client_decision_at: string | null;
  service_category: string;
};

export type PortalEstimateRow = {
  id: string;
  estimate_number: string;
  status: EstimateStatus;
  total: number;
  created_at: string;
  sent_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rug_tag: string | null;
  items: PortalEstimateItemRow[];
};

export async function fetchPortalEstimates() {
  const { data, error } = await supabaseExtended.rpc("get_portal_estimates", {});

  if (error) throw error;

  return ((data ?? []) as {
    estimate_id: string;
    estimate_number: string;
    status: EstimateStatus;
    total: number | string | null;
    created_at: string;
    sent_at: string | null;
    approved_at: string | null;
    rejected_at: string | null;
    rug_tag: string | null;
    items: PortalEstimateItemRow[] | null;
  }[]).map((row) => ({
    id: row.estimate_id,
    estimate_number: row.estimate_number,
    status: row.status,
    total: Number(row.total ?? 0),
    created_at: row.created_at,
    sent_at: row.sent_at,
    approved_at: row.approved_at,
    rejected_at: row.rejected_at,
    rug_tag: row.rug_tag,
    items: Array.isArray(row.items)
      ? row.items.map((item) => ({
          ...item,
          quantity: Number(item.quantity ?? 0),
          unit_price: Number(item.unit_price ?? 0),
          total: Number(item.total ?? 0),
        }))
      : [],
  }));
}
