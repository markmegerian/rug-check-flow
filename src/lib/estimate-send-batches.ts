import { supabaseExtended } from "@/integrations/supabase/extended";

export type EstimateSendBatchSummary = {
  batch_id: string;
  client_id: string;
  company_id: string | null;
  client_name: string | null;
  client_email: string | null;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  estimate_count: number;
  total_amount: number;
  estimate_ids: string[];
};

export async function fetchEstimateSendBatchSummaries() {
  const { data, error } = await supabaseExtended.rpc("get_estimate_send_batch_summaries", {});
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    total_amount: Number(row.total_amount ?? 0),
    estimate_count: Number(row.estimate_count ?? 0),
    estimate_ids: Array.isArray(row.estimate_ids) ? row.estimate_ids : [],
  })) as EstimateSendBatchSummary[];
}

export async function cancelEstimateSendBatch(batchId: string) {
  const { data, error } = await supabaseExtended.rpc("cancel_estimate_send_batch", { p_batch_id: batchId });
  if (error) throw error;
  return Number(data?.[0]?.updated_count ?? 0);
}

export async function requeueEstimateSendBatch(batchId: string) {
  const { data, error } = await supabaseExtended.rpc("requeue_estimate_send_batch", { p_batch_id: batchId });
  if (error) throw error;
  return Number(data?.[0]?.updated_count ?? 0);
}
