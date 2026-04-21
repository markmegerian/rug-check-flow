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
  const readyEstimates = estimatesInGroup.filter((estimate) => estimate.status === "ready_to_send" && estimate.client_id);
  const readyEstimateIds = readyEstimates.map((estimate) => estimate.id);

  const { data, error } = await supabaseExtended.rpc("queue_estimate_group_batch", {
    p_estimate_ids: readyEstimateIds,
  });

  if (error) throw error;

  if (readyEstimates.length > 0) {
    const firstEstimate = readyEstimates[0];
    const { data: clientRow } = await supabaseExtended
      .from("clients")
      .select("company_id,email,name")
      .eq("id", firstEstimate.client_id!)
      .maybeSingle();

    const scheduledFor = new Date().toISOString();
    const { data: batchRow, error: batchError } = await supabaseExtended
      .from("estimate_send_batches")
      .insert({
        client_id: firstEstimate.client_id,
        company_id: clientRow?.company_id ?? null,
        scheduled_for: scheduledFor,
        status: "queued",
        recipient_email: clientRow?.email ?? null,
        subject: clientRow?.name ? `Estimate batch for ${clientRow.name}` : "Estimate batch",
      })
      .select("id")
      .single();

    if (batchError) throw batchError;

    const batchItems = readyEstimateIds.map((estimateId) => ({
      batch_id: batchRow.id,
      estimate_id: estimateId,
    }));

    const { error: itemError } = await supabaseExtended
      .from("estimate_send_batch_items")
      .insert(batchItems);

    if (itemError) throw itemError;
  }

  return Number(data?.[0]?.queued_count ?? 0);
}
