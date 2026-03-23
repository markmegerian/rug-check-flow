import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { DAYS_OF_WEEK } from "@/lib/constants";

function getRouteDay(dateStr: string): string {
  const jsDay = new Date(dateStr + "T12:00:00").getDay(); // 0=Sun
  return DAYS_OF_WEEK[(jsDay + 6) % 7]; // Mon-Sun
}

/**
 * After the truck is finalized, create route_stops for each client
 * that has rugs being delivered today. Merges with any existing pickup
 * stops for the same client + date + driver.
 *
 * Also creates route_stop_items (phase="delivery") for each rug.
 */
export async function createDeliveryRouteStops(params: {
  deliveryListId: string;
  driverId: string;
  routeDate: string;
}): Promise<{ stopsCreated: number }> {
  const { deliveryListId, driverId, routeDate } = params;
  const routeDay = getRouteDay(routeDate);

  // 1. Get all items that were on the truck (confirmed + loaded)
  const { data: items, error: itemsErr } = await supabase
    .from("delivery_list_items")
    .select("id, rug_id, client_id")
    .eq("delivery_list_id", deliveryListId)
    .eq("confirmed_for_delivery", true)
    .eq("loaded_on_truck", true);

  if (itemsErr || !items || items.length === 0) {
    console.warn("No delivery items found for route stop creation:", itemsErr?.message);
    return { stopsCreated: 0 };
  }

  // 2. Group by client
  const clientRugs: Record<string, Array<{ rugId: string; deliveryListItemId: string }>> = {};
  for (const item of items) {
    if (!item.client_id) continue;
    if (!clientRugs[item.client_id]) clientRugs[item.client_id] = [];
    clientRugs[item.client_id].push({
      rugId: item.rug_id,
      deliveryListItemId: item.id,
    });
  }

  const clientIds = Object.keys(clientRugs);
  if (clientIds.length === 0) return { stopsCreated: 0 };

  // 3. Check for existing route_stops for these clients on this date
  const { data: existingStops } = await supabaseExtended
    .from("route_stops")
    .select("id, client_id")
    .in("client_id", clientIds)
    .eq("route_date", routeDate)
    .eq("assigned_driver_id", driverId);

  const existingStopByClient: Record<string, string> = {};
  (existingStops ?? []).forEach((s) => {
    if (s.client_id) existingStopByClient[s.client_id] = s.id;
  });

  let stopsCreated = 0;

  for (const clientId of clientIds) {
    let stopId = existingStopByClient[clientId];

    if (!stopId) {
      // Create new route_stop
      const { data: newStop, error: createErr } = await supabaseExtended
        .from("route_stops")
        .insert({
          client_id: clientId,
          route_date: routeDate,
          route_day: routeDay,
          assigned_driver_id: driverId,
          delivery_list_id: deliveryListId,
          status: "queued",
        })
        .select("id")
        .single();

      if (createErr || !newStop) {
        console.warn(`Failed to create route stop for client ${clientId}:`, createErr?.message);
        continue;
      }
      stopId = newStop.id;
      stopsCreated++;
    } else {
      // Update existing stop to reference the delivery list
      await supabaseExtended
        .from("route_stops")
        .update({ delivery_list_id: deliveryListId })
        .eq("id", stopId);
    }

    // 4. Check which delivery items already have route_stop_items
    const { data: existingItems } = await supabaseExtended
      .from("route_stop_items")
      .select("rug_id")
      .eq("route_stop_id", stopId)
      .eq("phase", "delivery");

    const existingRugIds = new Set(
      (existingItems ?? []).map((i: { rug_id: string | null }) => i.rug_id).filter(Boolean),
    );

    // 5. Create route_stop_items for new delivery rugs
    const newItems = clientRugs[clientId]
      .filter((r) => !existingRugIds.has(r.rugId))
      .map((r) => ({
        route_stop_id: stopId,
        phase: "delivery" as const,
        status: "pending" as const,
        rug_id: r.rugId,
        delivery_list_item_id: r.deliveryListItemId,
      }));

    if (newItems.length > 0) {
      const { error: insertErr } = await supabaseExtended
        .from("route_stop_items")
        .insert(newItems);

      if (insertErr) {
        console.warn(`Failed to create route stop items for client ${clientId}:`, insertErr.message);
      }
    }
  }

  return { stopsCreated };
}
