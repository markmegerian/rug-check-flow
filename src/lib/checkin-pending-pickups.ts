import { supabaseExtended } from "@/integrations/supabase/extended";
import type { PendingRug } from "@/types/pending-rug";

function parseRequestedServices(details: string | null | undefined) {
  const source = details ?? "";
  const servicesMatch = source.match(/^Services:\s*(.+?)(?:\s*\||$)/);
  if (!servicesMatch) return [];
  return servicesMatch[1].split(",").map((service) => service.trim()).filter(Boolean);
}

export async function fetchCheckinPendingPickups(targetDate: string): Promise<PendingRug[]> {
  const { data, error } = await supabaseExtended.rpc("get_checkin_pending_pickups", {
    p_target_date: targetDate,
  });

  if (error) throw error;

  return (data ?? []).map((item) => ({
    id: item.pickup_request_item_id,
    rugNumber: item.rug_number,
    clientId: item.client_id,
    clientName: item.client_name ?? "Unknown client",
    rugType: item.rug_type ?? "",
    length: Number(item.length ?? 0) || undefined,
    width: Number(item.width ?? 0) || undefined,
    requestedServices: parseRequestedServices(item.estimate_request_details),
    source: "pickup" as const,
    pickupRequestId: item.pickup_request_id,
    pickupRequestItemId: item.pickup_request_item_id,
    pickupDate: item.scheduled_date,
    estimateRequested: Boolean(item.estimate_requested),
    estimateRequestDetails: item.estimate_request_details ?? undefined,
  }));
}
