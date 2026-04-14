import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";

/**
 * Auto-send an estimate by calling the send-estimate-email edge function.
 * Missing email or provider failures must not be treated as sent.
 */
async function autoSendEstimate(estimateId: string): Promise<{ success: boolean; providerStatus?: string | null; error?: string | null; actionHint?: string | null }> {
  try {
    const { data, error } = await supabase.functions.invoke("send-estimate-email", {
      body: { estimate_id: estimateId },
    });

    if (error || data?.success === false) {
      console.warn("Auto-send estimate failed for", estimateId, error ?? data);
      return {
        success: false,
        providerStatus: data?.provider_status ?? null,
        error: data?.error ?? error?.message ?? "Unknown error",
        actionHint: data?.action_hint ?? null,
      };
    }

    return {
      success: true,
      providerStatus: data?.provider_status ?? null,
      error: null,
      actionHint: data?.action_hint ?? null,
    };
  } catch (error) {
    console.warn("Auto-send estimate failed for", estimateId, error);
    return { success: false, providerStatus: null, error: "Unknown error", actionHint: null };
  }
}

/** Upload a single check-in photo to storage. Returns the public URL or null on failure. */
export async function uploadCheckinPhoto(rugId: string, file: File): Promise<string | null> {
  const path = `rugs/${rugId}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
  const { error: uploadError } = await supabase.storage
    .from("checkin-photos")
    .upload(path, file, { upsert: false });
  if (uploadError) return null;
  const { data: publicUrl } = supabase.storage.from("checkin-photos").getPublicUrl(path);
  return publicUrl.publicUrl;
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
  if (serviceSnapshots.length === 0) return null;

  const serviceIds = serviceSnapshots.map((s) => s.service_id);
  const { data: serviceRows, error: serviceError } = await supabase
    .from("services")
    .select("id, name, requires_estimate")
    .in("id", serviceIds);

  if (serviceError) {
    onError("Estimate rule lookup failed", serviceError.message);
    return null;
  }

  const rows = (serviceRows ?? []) as unknown as Array<{ id: string; name: string; requires_estimate: boolean | null }>;
  const requiresEstimate = rows.some((row) => Boolean(row.requires_estimate));
  if (!requiresEstimate) return null;

  const estimateNumber = `EST-${Date.now().toString(36).toUpperCase()}`;
  const total = serviceSnapshots.reduce((sum, s) => sum + Number(s.line_total ?? 0), 0);

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
    onError("Estimate draft auto-create failed", estimateError?.message ?? "Unknown error");
    return null;
  }

  const idsForCategory = serviceIds.filter(Boolean);
  let categoryByServiceId: Record<string, string> = {};
  if (idsForCategory.length > 0) {
    const { data: catRows } = await supabaseExtended.from("services").select("id, category").in("id", idsForCategory);
    categoryByServiceId = Object.fromEntries(((catRows ?? []) as { id: string; category: string }[]).map((r) => [r.id, r.category ?? ""]));
  }

  const estimateItems = serviceSnapshots.map((s) => ({
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

  await supabaseExtended.from("communication_events").insert({
    client_id: clientId,
    rug_id: rugId,
    estimate_id: insertedEstimate.id,
    channel: "in_app_chat",
    direction: "outbound",
    event_type: "estimate_auto_drafted_from_checkin",
    subject: `${estimateNumber} auto-drafted`,
    body: `Estimate ${estimateNumber} was auto-created from check-in service selections.`,
  });

  // Auto-send the estimate to the client
  const sendResult = await autoSendEstimate(insertedEstimate.id);

  if (sendResult.success) {
    onSuccess("Estimate auto-created & sent", `${estimateNumber} has been sent to the client.`);
  } else if (sendResult.providerStatus === "no_email") {
    onError("Estimate auto-send blocked", `${estimateNumber} was created as a draft, but the client email is missing. Add an email before sending.${sendResult.actionHint ? ` ${sendResult.actionHint}` : ""}`);
  } else {
    onError("Estimate auto-send failed", `${estimateNumber} was created as a draft, but sending failed.${sendResult.error ? ` ${sendResult.error}` : ""}${sendResult.actionHint ? ` ${sendResult.actionHint}` : ""}`);
  }

  return estimateNumber;
}
