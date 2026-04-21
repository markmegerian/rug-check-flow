import { supabaseExtended, type EstimateReviewGroupRow } from "@/integrations/supabase/extended";

export async function fetchEstimateReviewGroups() {
  const { data, error } = await supabaseExtended.rpc("get_estimate_review_groups");
  if (error) throw error;
  return ((data ?? []) as EstimateReviewGroupRow[]).map((row) => ({
    ...row,
    estimate_count: Number(row.estimate_count ?? 0),
    total_amount: Number(row.total_amount ?? 0),
    ready_count: Number(row.ready_count ?? 0),
    review_count: Number(row.review_count ?? 0),
    sent_count: Number(row.sent_count ?? 0),
    estimate_ids: Array.isArray(row.estimate_ids) ? row.estimate_ids : [],
  }));
}
