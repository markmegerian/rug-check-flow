import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";

/** Upload a single check-in photo to storage. Returns { publicUrl, storagePath } or null on failure. */
export async function uploadCheckinPhoto(rugId: string, file: File): Promise<{ publicUrl: string; storagePath: string } | null> {
  const path = `rugs/${rugId}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
  const { error: uploadError } = await supabase.storage
    .from("checkin-photos")
    .upload(path, file, { upsert: false });
  if (uploadError) return null;
  const { data: publicUrl } = supabase.storage.from("checkin-photos").getPublicUrl(path);
  return { publicUrl: publicUrl.publicUrl, storagePath: path };
}

/**
 * Persist all uploaded photo URLs to the rug_photos table.
 * Falls back gracefully if the table hasn't been migrated yet.
 * Also sets the first photo as rugs.photo_url for backward compat.
 */
export async function persistRugPhotos(
  rugId: string,
  uploads: Array<{ publicUrl: string; storagePath: string }>,
): Promise<{ detailTableFailed: boolean }> {
  if (uploads.length === 0) return { detailTableFailed: false };

  // Always set first photo on the rugs row for backward compat
  await supabase.from("rugs").update({ photo_url: uploads[0].publicUrl }).eq("id", rugId);

  // Persist all photos to rug_photos table
  const rows = uploads.map((u, i) => ({
    rug_id: rugId,
    storage_path: u.storagePath,
    public_url: u.publicUrl,
    display_order: i,
  }));

  const { error } = await supabaseExtended.from("rug_photos").insert(rows);
  if (error) {
    console.error("rug_photos insert failed (table may not exist yet):", error.message);
    return { detailTableFailed: true };
  }

  return { detailTableFailed: false };
}

/** Generate a short random suffix from crypto.randomUUID for collision resistance. */
function shortUid(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Generate a unique document number with a date prefix. */
export function generateDocNumber(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${prefix}-${date}-${shortUid()}`;
}

/** Generate a unique job code for an intake job. */
export function generateJobCode(): string {
  return generateDocNumber("JOB");
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

  const estimateNumber = generateDocNumber("EST");
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

  onSuccess("Estimate draft auto-created", `${estimateNumber} is ready for office review.`);
  return estimateNumber;
}
