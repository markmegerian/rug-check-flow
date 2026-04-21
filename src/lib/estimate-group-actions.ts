import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";
import { queueEstimateForBatchSend } from "@/lib/notification-cadence-store";

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
  const readyEstimates = estimatesInGroup.filter((estimate) => estimate.status === "ready_to_send");
  const queuedAt = new Date().toISOString();

  await Promise.all(readyEstimates.map((estimate) => queueEstimateForBatchSend({
    clientId: estimate.client_id!,
    estimateId: estimate.id,
    queuedAt,
  })));

  return readyEstimates.length;
}
