import { supabaseExtended } from "@/integrations/supabase/extended";

/**
 * Auto-create a route_stop for a pickup request when it gets a driver assigned.
 * This ensures the pickup appears in the driver's route automatically.
 *
 * Called when:
 * - Office assigns a driver to a pickup request
 * - A pickup request is confirmed (auto-assigns based on route_day default driver)
 */
export async function ensureRouteStopForPickup(pickupRequestId: string): Promise<{ stopId: string } | null> {
  // Fetch the pickup request
  const { data: request, error: reqError } = await supabaseExtended
    .from("pickup_requests")
    .select("id, client_id, scheduled_date, assigned_driver_id, status")
    .eq("id", pickupRequestId)
    .single();

  if (reqError || !request) {
    console.warn("Failed to fetch pickup request for auto-scheduling:", reqError?.message);
    return null;
  }

  if (!request.assigned_driver_id || !request.scheduled_date || !request.client_id) {
    return null;
  }

  // Check if a route_stop already exists for this pickup request
  const { data: existingStop } = await supabaseExtended
    .from("route_stops")
    .select("id")
    .eq("pickup_request_id", pickupRequestId)
    .limit(1);

  if (existingStop && existingStop.length > 0) {
    return { stopId: existingStop[0].id };
  }

  // Check if a route_stop exists for this client + date (might have delivery + pickup combined)
  const { data: existingClientStop } = await supabaseExtended
    .from("route_stops")
    .select("id")
    .eq("client_id", request.client_id)
    .eq("route_date", request.scheduled_date)
    .eq("assigned_driver_id", request.assigned_driver_id)
    .limit(1);

  let stopId: string;

  if (existingClientStop && existingClientStop.length > 0) {
    // Update existing stop to also reference this pickup request
    stopId = existingClientStop[0].id;
    await supabaseExtended
      .from("route_stops")
      .update({ pickup_request_id: pickupRequestId })
      .eq("id", stopId);
  } else {
    // Create a new route_stop
    const { data: newStop, error: createError } = await supabaseExtended
      .from("route_stops")
      .insert({
        client_id: request.client_id,
        route_date: request.scheduled_date,
        assigned_driver_id: request.assigned_driver_id,
        pickup_request_id: pickupRequestId,
        status: "queued",
      })
      .select("id")
      .single();

    if (createError || !newStop) {
      console.warn("Failed to create route_stop for pickup:", createError?.message);
      return null;
    }

    stopId = newStop.id;
  }

  // Fetch pickup request items and create route_stop_items
  const { data: pickupItems } = await supabaseExtended
    .from("pickup_request_items")
    .select("id, rug_id, rug_number, is_new")
    .eq("pickup_request_id", pickupRequestId);

  if (pickupItems && pickupItems.length > 0) {
    // Check which items already have route_stop_items
    const existingItemRugIds = new Set<string>();
    const { data: existingStopItems } = await supabaseExtended
      .from("route_stop_items")
      .select("rug_id")
      .eq("route_stop_id", stopId)
      .eq("phase", "pickup");

    if (existingStopItems) {
      existingStopItems.forEach((i: { rug_id: string | null }) => {
        if (i.rug_id) existingItemRugIds.add(i.rug_id);
      });
    }

    const newStopItems = pickupItems
      .filter((item) => {
        // Skip items that already have a route_stop_item
        if (item.rug_id && existingItemRugIds.has(item.rug_id)) return false;
        return true;
      })
      .map((item) => ({
        route_stop_id: stopId,
        phase: "pickup" as const,
        status: "pending" as const,
        rug_id: item.rug_id || null,
      }));

    if (newStopItems.length > 0) {
      await supabaseExtended
        .from("route_stop_items")
        .insert(newStopItems);
    }
  }

  return { stopId };
}
