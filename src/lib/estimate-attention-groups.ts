import { supabaseExtended } from "@/integrations/supabase/extended";
import type { EstimateStatus } from "@/lib/workflow-guards";

export type EstimateAttentionGroupRow = {
  client_id: string;
  client_name: string | null;
  client_email: string | null;
  company_name: string | null;
  estimate_count: number;
  total_amount: number;
  review_count: number;
  revision_count: number;
  ready_count: number;
  latest_created_at: string | null;
  rug_tags: string[];
  estimate_ids: string[];
};

export type EstimateAttentionDetailRow = {
  id: string;
  rug_id: string;
  client_id: string;
  estimate_number: string;
  status: EstimateStatus;
  version: number;
  total: number;
  created_at: string;
  sent_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  client_name: string | null;
  client_email: string | null;
  company_name: string | null;
  rug_tag: string | null;
};

export async function fetchEstimateAttentionGroups() {
  const { data, error } = await supabaseExtended.rpc("get_estimate_attention_groups", {});
  if (error) throw error;

  return ((data ?? []) as EstimateAttentionGroupRow[]).map((row) => ({
    ...row,
    estimate_count: Number(row.estimate_count ?? 0),
    total_amount: Number(row.total_amount ?? 0),
    review_count: Number(row.review_count ?? 0),
    revision_count: Number(row.revision_count ?? 0),
    ready_count: Number(row.ready_count ?? 0),
    rug_tags: Array.isArray(row.rug_tags) ? row.rug_tags.filter(Boolean) : [],
    estimate_ids: Array.isArray(row.estimate_ids) ? row.estimate_ids : [],
  }));
}

export async function fetchEstimateAttentionGroupDetails(clientId: string) {
  const { data, error } = await supabaseExtended.rpc("get_estimate_attention_group_details", {
    p_client_id: clientId,
  });
  if (error) throw error;

  return ((data ?? []) as EstimateAttentionDetailRow[]).map((row) => ({
    ...row,
    total: Number(row.total ?? 0),
    version: Number(row.version ?? 1),
  }));
}
