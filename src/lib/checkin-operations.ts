import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { queueEstimateForBatchSend } from "@/lib/notification-cadence-store";
import { isCleaningCategory } from "@/lib/service-pricing";
import { logger } from "@/lib/logger";

/** Upload a single check-in photo to storage. Returns storage metadata for workflow submission or null on failure. */
export async function uploadCheckinPhotoFile(rugId: string, file: File): Promise<{ storage_path: string; public_url: string } | null> {
  const path = `rugs/${rugId}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
  const { error: uploadError } = await supabase.storage
    .from("checkin-photos")
    .upload(path, file, { upsert: false });
  if (uploadError) return null;

  const { data: publicUrl } = supabase.storage.from("checkin-photos").getPublicUrl(path);
  return { storage_path: path, public_url: publicUrl.publicUrl };
}

/** Generate a unique job code for an intake job. */
export function generateJobCode(): string {
  return `JOB-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

interface ServiceSnapshot {
  service_id: string;
  service_name: string;
  unit_price: number;
  line_total: number;
  edges: string[];
}

let estimateDraftCreationAvailable: boolean | null = null;

function isEstimateDraftRlsError(message: string | undefined) {
  return /row-level security|permission denied|not allowed/i.test(message ?? "") && /estimate/i.test(message ?? "");
}

export function isEstimateDraftCreationAvailable() {
  return estimateDraftCreationAvailable !== false;
}

/**
 * Auto-create an estimate draft if any selected services require one.
 * Returns the estimate number if created, null otherwise.
 */
export async function maybeAutoCreateEstimateDraft(
  rugId: string,
  clientId: string | null,
  rugNumber: string,
  serviceSnapshots: ServiceSnapshot[],
  onError: (title: string, description: string) => void,
  onSuccess: (title: string, description: string) => void,
): Promise<string | null> {
  if (serviceSnapshots.length === 0 || estimateDraftCreationAvailable === false) return null;

  const serviceIds = [...new Set(serviceSnapshots.map((s) => s.service_id).filter(Boolean))];
  if (serviceIds.length === 0) return null;

  const { data: serviceRows, error: serviceError } = await supabase
    .from("services")
    .select("id, name, requires_estimate, category")
    .in("id", serviceIds);

  if (serviceError) {
    onError("Estimate rule lookup failed", serviceError.message);
    return null;
  }

  const rows = (serviceRows ?? []) as unknown as Array<{ id: string; name: string; requires_estimate: boolean | null; category: string | null }>;
  const eligibleSnapshots = serviceSnapshots.filter((snapshot) => {
    const serviceRow = rows.find((row) => row.id === snapshot.service_id);
    return Boolean(serviceRow?.requires_estimate) && !isCleaningCategory(serviceRow?.category);
  });

  if (eligibleSnapshots.length === 0) return null;

  const estimateNumber = `EST-${Date.now().toString(36).toUpperCase()}`;
  const total = eligibleSnapshots.reduce((sum, s) => sum + Number(s.line_total ?? 0), 0);

  const { data: insertedEstimate, error: estimateError } = await supabaseExtended
    .from("estimates")
    .insert({
      rug_id: rugId,
      client_id: clientId,
      estimate_number: estimateNumber,
      status: "draft",
      version: 1,
      total,
    })
    .select("id")
    .single();

  if (estimateError || !insertedEstimate) {
    const message = estimateError?.message ?? "Unknown error";
    if (isEstimateDraftRlsError(message)) {
      estimateDraftCreationAvailable = false;
      logger.warn("estimate_draft_auto_create_unavailable", { message });
      return null;
    }
    onError("Estimate draft auto-create failed", message);
    return null;
  }

  estimateDraftCreationAvailable = true;

  const categoryByServiceId = Object.fromEntries(
    rows.map((row) => [row.id, row.category ?? ""]),
  );

  const estimateItems = eligibleSnapshots.map((s) => ({
    estimate_id: insertedEstimate.id,
    rug_service_id: null,
    description: `${rugNumber} — ${s.service_name}`,
    quantity: 1,
    unit_price: Number(s.unit_price ?? 0),
    total: Number(s.line_total ?? 0),
    service_category: s.service_id ? (categoryByServiceId[s.service_id] ?? "") : "",
  }));

  const { error: itemError } = await supabaseExtended.from("estimate_items").insert(estimateItems);
  if (itemError) {
    await supabaseExtended.from("estimates").delete().eq("id", insertedEstimate.id);
    onError("Estimate draft item sync failed", itemError.message);
    return null;
  }

  void (async () => {
    const tasks: Promise<unknown>[] = [
      supabaseExtended.from("communication_events").insert({
        client_id: clientId,
        rug_id: rugId,
        estimate_id: insertedEstimate.id,
        channel: "in_app_chat",
        direction: "outbound",
        event_type: "estimate_auto_drafted_from_checkin",
        subject: `${estimateNumber} auto-drafted`,
        body: `Estimate ${estimateNumber} was auto-created from check-in service selections.`,
      }),
    ];

    if (clientId) {
      tasks.push(queueEstimateForBatchSend({
        clientId,
        estimateId: insertedEstimate.id,
        queuedAt: new Date().toISOString(),
      }));
    }

    const [communicationEventResult, queueResult] = await Promise.allSettled(tasks);

    if (communicationEventResult.status === "fulfilled" && communicationEventResult.value?.error) {
      logger.warn("estimate_auto_draft_comm_event_error", {
        estimateId: insertedEstimate.id,
        error: communicationEventResult.value.error,
      });
    } else if (communicationEventResult.status === "rejected") {
      logger.warn("estimate_auto_draft_comm_event_rejected", {
        estimateId: insertedEstimate.id,
        reason: communicationEventResult.reason,
      });
    }

    if (queueResult?.status === "rejected") {
      logger.warn("estimate_batch_queue_failed", {
        estimateId: insertedEstimate.id,
        reason: queueResult.reason,
      });
    }
  })();

  if (clientId) {
    onSuccess("Estimate auto-created", `${estimateNumber} was created and batch queueing started.`);
  } else {
    onError("Estimate queued manually", `${estimateNumber} was created as a draft, but no client is linked yet, so it was not queued for the 3:00 PM Eastern send batch.`);
  }

  return estimateNumber;
}
