import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";

type EstimateRow = {
  id: string;
  rug_id: string;
  client_id: string | null;
  estimate_number: string;
  status: ExtendedTableRow<"estimates">["status"];
  created_at: string;
  clients?: { name?: string | null; email?: string | null } | null;
};

export async function markEstimateGroupReady(estimatesInGroup: EstimateRow[]) {
  const reviewEstimateIds = estimatesInGroup
    .filter((estimate) => estimate.status === "needs_office_review")
    .map((estimate) => estimate.id);

  const { data, error } = await supabaseExtended.rpc("mark_estimate_group_ready", {
    p_estimate_ids: reviewEstimateIds,
  });

  if (error) throw error;
  return Number(data?.[0]?.updated_count ?? 0);
}

export async function expireEstimateGroup(estimatesInGroup: EstimateRow[]) {
  const expirableIds = estimatesInGroup
    .filter((estimate) => ["needs_office_review", "ready_to_send", "sent", "needs_revision"].includes(estimate.status))
    .map((estimate) => estimate.id);

  const { data, error } = await supabaseExtended.rpc("expire_estimate_group", {
    p_estimate_ids: expirableIds,
  });

  if (error) throw error;
  return Number(data?.[0]?.updated_count ?? 0);
}

export async function queueEstimateGroupBatch(estimatesInGroup: EstimateRow[]) {
  const readyEstimateIds = estimatesInGroup
    .filter((estimate) => estimate.status === "ready_to_send")
    .map((estimate) => estimate.id);

  const { data, error } = await supabaseExtended.rpc("queue_estimate_group_batch", {
    p_estimate_ids: readyEstimateIds,
  });

  if (error) throw error;
  return Number(data?.[0]?.queued_count ?? 0);
}
