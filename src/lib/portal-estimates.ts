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

export type PortalEstimatePage = {
  rows: PortalEstimateRow[];
  total: number;
};

export async function fetchPortalEstimates({
  statusScope = "all",
  page = 0,
  pageSize = 10,
}: {
  statusScope?: "all" | "pending" | "history";
  page?: number;
  pageSize?: number;
} = {}): Promise<PortalEstimatePage> {
  const { data, error } = await supabaseExtended.rpc("get_portal_estimates", {
    p_status_scope: statusScope,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) throw error;

  const rows = ((data ?? []) as {
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
    total_count: number;
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

  return {
    rows,
    total: data && data.length > 0 ? Number((data[0] as { total_count?: number }).total_count ?? 0) : 0,
  };
}
