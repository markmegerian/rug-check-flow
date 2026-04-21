import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";
import { queueEstimateForBatchSend } from "@/lib/notification-cadence-store";
import { formatDateTime } from "@/lib/date-helpers";

type EstimateRow = {
  id: string;
  rug_id: string;
  client_id: string | null;
  estimate_number: string;
  status: ExtendedTableRow<"estimates">["status"];
  created_at: string;
  clients?: { name?: string | null; email?: string | null } | null;
};

async function logCommunicationEvent(estimate: EstimateRow, eventType: string, subject: string, body: string) {
  const { error } = await supabaseExtended.from("communication_events").insert({
    client_id: estimate.client_id,
    rug_id: estimate.rug_id,
    estimate_id: estimate.id,
    channel: "email",
    direction: "outbound",
    event_type: eventType,
    subject,
    body,
    sent_to: estimate.clients?.email ?? null,
  });

  if (error) throw error;
}

export async function markEstimateGroupReady(estimatesInGroup: EstimateRow[]) {
  const reviewEstimates = estimatesInGroup.filter((estimate) => estimate.status === "needs_office_review");
  const updates = await Promise.all(reviewEstimates.map((estimate) =>
    supabaseExtended
      .from("estimates")
      .update({ status: "ready_to_send" })
      .eq("id", estimate.id),
  ));

  const failed = updates.find((result) => result.error);
  if (failed?.error) throw failed.error;

  await Promise.all(reviewEstimates.map((estimate) => logCommunicationEvent(
    { ...estimate, status: "ready_to_send" },
    "estimate_ready_to_send",
    `${estimate.estimate_number} ready to send`,
    `Estimate ${estimate.estimate_number} for ${estimate.clients?.name ?? "client"} is ready to send.`,
  )));

  return reviewEstimates.length;
}

export async function expireEstimateGroup(estimatesInGroup: EstimateRow[]) {
  const expirable = estimatesInGroup.filter((estimate) => ["needs_office_review", "ready_to_send", "sent", "needs_revision"].includes(estimate.status));
  const nowIso = new Date().toISOString();

  const updates = await Promise.all(expirable.map((estimate) =>
    supabaseExtended
      .from("estimates")
      .update({ status: "expired" })
      .eq("id", estimate.id),
  ));

  const failed = updates.find((result) => result.error);
  if (failed?.error) throw failed.error;

  await Promise.all(expirable.map((estimate) => logCommunicationEvent(
    { ...estimate, status: "expired" },
    "estimate_expired",
    `${estimate.estimate_number} expired`,
    `Estimate ${estimate.estimate_number} for ${estimate.clients?.name ?? "client"} was marked expired on ${formatDateTime(nowIso)}.`,
  )));

  return expirable.length;
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
