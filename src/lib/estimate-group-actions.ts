import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";
import type { EstimateStatus } from "@/lib/workflow-guards";

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
    .filter((estimate) => estimate.status === "ready_to_send" && estimate.client_id)
    .map((estimate) => estimate.id);

  const { data, error } = await supabaseExtended.rpc("queue_estimate_group_batch", {
    p_estimate_ids: readyEstimateIds,
  });

  if (error) throw error;
  return Number(data?.[0]?.queued_count ?? 0);
}

export async function transitionEstimateStatus(params: {
  estimateId: string;
  nextStatus: Extract<EstimateStatus, "approved" | "rejected" | "needs_office_review">;
  note?: string;
}) {
  const { data, error } = await supabaseExtended.rpc("transition_estimate_status", {
    p_estimate_id: params.estimateId,
    p_next_status: params.nextStatus,
    p_note: params.note ?? null,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : null;
  return {
    updatedCount: Number(row?.updated_count ?? 0),
    estimateId: row?.estimate_id ?? params.estimateId,
    status: (row?.status ?? params.nextStatus) as EstimateStatus,
    approvedAt: row?.approved_at ?? null,
    rejectedAt: row?.rejected_at ?? null,
  };
}
