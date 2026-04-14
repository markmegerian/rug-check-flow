import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type StopEvent = {
  offline_event_id: string;
  route_stop_id: string;
  event_type: string;
  payload?: Record<string, unknown>;
};

type RouteStopRow = {
  id: string;
  route_date: string;
  client_id: string;
  route_day: string;
  assigned_driver_id: string | null;
  delivery_list_id: string | null;
  pickup_request_id: string | null;
  status: string;
  signature_data_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  exception_code: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
};

type RouteStopItemRow = {
  id: string;
  route_stop_id: string;
  phase: string;
  status: string;
  rug_id: string | null;
  pickup_request_item_id: string | null;
  delivery_list_item_id: string | null;
  notes: string;
  photo_urls: string[];
  exception_code: string | null;
  created_at: string;
  updated_at: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "Supabase environment is not configured for this function." }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;

    // Check user role
    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "office", "checkin_staff", "driver"]);

    if (roleError) return json({ error: roleError.message }, 500);
    const roles = (roleRows ?? []).map((r) => r.role);
    const hasInternalRole = roles.some((r) => ["admin", "office", "checkin_staff"].includes(r));
    const isDriver = roles.includes("driver");

    if (!hasInternalRole && !isDriver) {
      return json({ error: "Forbidden: user must be driver, admin, office, or checkin_staff" }, 403);
    }

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const events: StopEvent[] = Array.isArray(body.events) ? body.events : [];

    if (events.length === 0) {
      return json({ error: "events array is required and must not be empty" }, 400);
    }

    // Validate event structure
    for (const event of events) {
      if (!event.offline_event_id || !event.route_stop_id || !event.event_type) {
        return json(
          { error: "Each event must have offline_event_id, route_stop_id, and event_type" },
          400
        );
      }
    }

    // Get unique stop IDs from events
    const stopIds = [...new Set(events.map((e) => e.route_stop_id))];

    // Verify driver access: if driver, must be assigned to all stops
    if (isDriver && !hasInternalRole) {
      const { data: stops, error: stopsError } = await adminClient
        .from("route_stops")
        .select("id, assigned_driver_id")
        .in("id", stopIds);

      if (stopsError) return json({ error: stopsError.message }, 500);

      if (!stops || stops.length !== stopIds.length) {
        return json({ error: "One or more route stops not found" }, 404);
      }

      for (const stop of stops) {
        if (stop.assigned_driver_id !== user.id) {
          return json(
            { error: `Forbidden: driver not assigned to stop ${stop.id}` },
            403
          );
        }
      }
    }

    // Process events in a transaction-like manner
    // We'll process them sequentially to maintain order
    const processedEventIds: string[] = [];
    const errors: Array<{ offline_event_id: string; error: string }> = [];

    for (const event of events) {
      try {
        // Check if event already exists (idempotency check)
        const { data: existingEvent } = await adminClient
          .from("route_stop_events")
          .select("id")
          .eq("offline_event_id", event.offline_event_id)
          .maybeSingle();

        if (existingEvent) {
          // Event already processed - verify effect was applied by checking current state
          // This handles the case where event was inserted but effect application failed
          const effectApplied = await verifyEventEffectApplied(adminClient, event);
          if (effectApplied) {
            // Effect already applied, skip
            processedEventIds.push(event.offline_event_id);
            continue;
          }
          // Effect not applied, re-apply it
        } else {
          // Insert new event
          const { error: insertError } = await adminClient
            .from("route_stop_events")
            .insert({
              offline_event_id: event.offline_event_id,
              route_stop_id: event.route_stop_id,
              event_type: event.event_type,
              payload: event.payload ?? {},
              created_by: user.id,
            })
            .select()
            .single();

          if (insertError) {
            throw insertError;
          }
        }

        processedEventIds.push(event.offline_event_id);

        // Apply event effects based on event_type
        try {
          await applyEventEffect(adminClient, event, user.id);
        } catch (err) {
          // If it's a 409 error (completion failed), return it immediately
          if (err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 409) {
            const errorData = err as Error & { statusCode?: number; route_stop_id?: string; pending_items?: string[] };
            return json(
              {
                error: err.message,
                route_stop_id: errorData.route_stop_id,
                pending_items: errorData.pending_items,
                offline_event_id: event.offline_event_id,
              },
              409
            );
          }
          // Otherwise, add to errors and continue
          throw err;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push({ offline_event_id: event.offline_event_id, error: errorMsg });
        console.error(`Failed to process event ${event.offline_event_id}:`, err);
      }
    }

    // If all events failed, return error
    if (errors.length === events.length) {
      return json(
        {
          error: "All events failed to process",
          errors,
        },
        500
      );
    }

    // Get updated stop snapshots for all affected stops
    const stopSnapshots: Record<string, { stop: RouteStopRow; items: RouteStopItemRow[] }> = {};

    for (const stopId of stopIds) {
      const { data: stop, error: stopError } = await adminClient
        .from("route_stops")
        .select("*")
        .eq("id", stopId)
        .single<RouteStopRow>();

      if (stopError || !stop) {
        console.error(`Failed to fetch stop ${stopId}:`, stopError);
        continue;
      }

      const { data: items, error: itemsError } = await adminClient
        .from("route_stop_items")
        .select("*")
        .eq("route_stop_id", stopId)
        .order("phase", { ascending: true })
        .order("created_at", { ascending: true })
        .returns<RouteStopItemRow[]>();

      if (itemsError) {
        console.error(`Failed to fetch items for stop ${stopId}:`, itemsError);
        continue;
      }

      stopSnapshots[stopId] = {
        stop,
        items: items ?? [],
      };
    }

    return json({
      success: true,
      processed_events: processedEventIds.length,
      failed_events: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      stops: stopSnapshots,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error("ingest-stop-events unhandled error", error);
    return json({ error: "Internal server error", details }, 500);
  }
});

/**
 * Apply the effect of an event to the database
 */
async function applyEventEffect(
  adminClient: ReturnType<typeof createClient>,
  event: StopEvent,
  userId: string
): Promise<void> {
  const { route_stop_id, event_type, payload } = event;

  switch (event_type) {
    case "STOP_STARTED": {
      const { error } = await adminClient
        .from("route_stops")
        .update({
          status: "in_progress",
          started_at: new Date().toISOString(),
        })
        .eq("id", route_stop_id);

      if (error) throw new Error(`Failed to start stop: ${error.message}`);
      break;
    }

    case "SIGNATURE_SET": {
      const signatureDataUrl = typeof payload?.signature_data_url === "string"
        ? payload.signature_data_url
        : null;

      if (!signatureDataUrl) {
        throw new Error("SIGNATURE_SET event requires signature_data_url in payload");
      }

      const { error } = await adminClient
        .from("route_stops")
        .update({ signature_data_url: signatureDataUrl })
        .eq("id", route_stop_id);

      if (error) throw new Error(`Failed to set signature: ${error.message}`);
      break;
    }

    case "ITEM_VERIFIED": {
      const itemId = typeof payload?.route_stop_item_id === "string"
        ? payload.route_stop_item_id
        : null;

      if (!itemId) {
        throw new Error("ITEM_VERIFIED event requires route_stop_item_id in payload");
      }

      const { error } = await adminClient
        .from("route_stop_items")
        .update({ status: "verified" })
        .eq("id", itemId)
        .eq("route_stop_id", route_stop_id);

      if (error) throw new Error(`Failed to verify item: ${error.message}`);
      break;
    }

    case "ITEM_SKIPPED": {
      const itemId = typeof payload?.route_stop_item_id === "string"
        ? payload.route_stop_item_id
        : null;

      if (!itemId) {
        throw new Error("ITEM_SKIPPED event requires route_stop_item_id in payload");
      }

      const { error } = await adminClient
        .from("route_stop_items")
        .update({ status: "skipped" })
        .eq("id", itemId)
        .eq("route_stop_id", route_stop_id);

      if (error) throw new Error(`Failed to skip item: ${error.message}`);
      break;
    }

    case "ITEM_EXCEPTION": {
      const itemId = typeof payload?.route_stop_item_id === "string"
        ? payload.route_stop_item_id
        : null;
      const exceptionCode = typeof payload?.exception_code === "string"
        ? payload.exception_code
        : null;
      const notes = typeof payload?.notes === "string" ? payload.notes : "";
      const photoUrls = Array.isArray(payload?.photo_urls)
        ? payload.photo_urls.filter((url): url is string => typeof url === "string")
        : [];

      if (!itemId) {
        throw new Error("ITEM_EXCEPTION event requires route_stop_item_id in payload");
      }

      const updateData: {
        status: string;
        exception_code: string | null;
        notes: string;
        photo_urls?: string[];
      } = {
        status: "exception",
        exception_code: exceptionCode,
        notes,
      };

      // Append photo URLs if provided
      if (photoUrls.length > 0) {
        const { data: currentItem } = await adminClient
          .from("route_stop_items")
          .select("photo_urls")
          .eq("id", itemId)
          .single();

        const currentUrls = (currentItem?.photo_urls ?? []) as string[];
        updateData.photo_urls = [...currentUrls, ...photoUrls];
      }

      const { error } = await adminClient
        .from("route_stop_items")
        .update(updateData)
        .eq("id", itemId)
        .eq("route_stop_id", route_stop_id);

      if (error) throw new Error(`Failed to set item exception: ${error.message}`);
      break;
    }

    case "ITEM_DISPUTED": {
      const itemId = typeof payload?.route_stop_item_id === "string"
        ? payload.route_stop_item_id
        : null;
      const disputeType = typeof payload?.dispute_type === "string"
        ? payload.dispute_type
        : null;
      const notes = typeof payload?.notes === "string" ? payload.notes : "";

      if (!itemId) {
        throw new Error("ITEM_DISPUTED event requires route_stop_item_id in payload");
      }

      if (!disputeType || !["refused_delivery", "post_delivery_claim"].includes(disputeType)) {
        throw new Error("ITEM_DISPUTED event requires valid dispute_type in payload (refused_delivery or post_delivery_claim)");
      }

      // Get the item to find rug_id and client_id
      const { data: item, error: itemError } = await adminClient
        .from("route_stop_items")
        .select("rug_id, route_stop_id")
        .eq("id", itemId)
        .single();

      if (itemError || !item) {
        throw new Error(`Failed to find item: ${itemError?.message ?? "not found"}`);
      }

      if (!item.rug_id) {
        throw new Error("Item must have rug_id to create dispute");
      }

      // Get the stop to find client_id
      const { data: stop, error: stopError } = await adminClient
        .from("route_stops")
        .select("client_id")
        .eq("id", item.route_stop_id)
        .single();

      if (stopError || !stop) {
        throw new Error(`Failed to find stop: ${stopError?.message ?? "not found"}`);
      }

      // Update item status to disputed
      const { error: itemUpdateError } = await adminClient
        .from("route_stop_items")
        .update({ status: "disputed" })
        .eq("id", itemId);

      if (itemUpdateError) {
        throw new Error(`Failed to update item status: ${itemUpdateError.message}`);
      }

      // Create dispute record
      const { error: disputeError } = await adminClient.from("disputes").insert({
        rug_id: item.rug_id,
        client_id: stop.client_id,
        type: disputeType,
        status: "open",
        notes,
        created_by: userId,
      });

      if (disputeError) {
        throw new Error(`Failed to create dispute: ${disputeError.message}`);
      }

      // If refused_delivery, ensure rug stays in 'ready' status (not picked_up)
      // This is handled by the application logic - we don't update rug status here
      // The checkout-delivery function should check for disputes before marking rugs as picked_up
      break;
    }

    case "PHOTO_ATTACHED": {
      const itemId = typeof payload?.route_stop_item_id === "string"
        ? payload.route_stop_item_id
        : null;
      const photoUrl = typeof payload?.photo_url === "string" ? payload.photo_url : null;

      if (!itemId || !photoUrl) {
        throw new Error("PHOTO_ATTACHED event requires route_stop_item_id and photo_url in payload");
      }

      // Get current photo URLs
      const { data: currentItem } = await adminClient
        .from("route_stop_items")
        .select("photo_urls")
        .eq("id", itemId)
        .single();

      const currentUrls = (currentItem?.photo_urls ?? []) as string[];
      if (currentUrls.includes(photoUrl)) {
        // Photo already attached, skip (idempotent)
        break;
      }

      const { error } = await adminClient
        .from("route_stop_items")
        .update({ photo_urls: [...currentUrls, photoUrl] })
        .eq("id", itemId)
        .eq("route_stop_id", route_stop_id);

      if (error) throw new Error(`Failed to attach photo: ${error.message}`);
      break;
    }

    case "STOP_COMPLETED": {
      // Attempt to transition stop to completed status
      // The database trigger will validate completion invariants
      const { data: stop, error: stopFetchError } = await adminClient
        .from("route_stops")
        .select("id, status, signature_data_url")
        .eq("id", route_stop_id)
        .single();

      if (stopFetchError || !stop) {
        throw new Error(`Failed to fetch stop: ${stopFetchError?.message ?? "not found"}`);
      }

      // Check signature
      if (!stop.signature_data_url) {
        const error = new Error("Cannot complete stop: signature is required");
        (error as Error & { statusCode?: number; route_stop_id?: string }).statusCode = 409;
        (error as Error & { route_stop_id?: string }).route_stop_id = route_stop_id;
        throw error;
      }

      // Get all items
      const { data: items, error: itemsError } = await adminClient
        .from("route_stop_items")
        .select("id, status, phase, rug_id")
        .eq("route_stop_id", route_stop_id);

      if (itemsError) {
        throw new Error(`Failed to fetch items: ${itemsError.message}`);
      }

      if (!items || items.length === 0) {
        const error = new Error("Cannot complete stop: no items found");
        (error as Error & { statusCode?: number; route_stop_id?: string }).statusCode = 409;
        (error as Error & { route_stop_id?: string }).route_stop_id = route_stop_id;
        throw error;
      }

      // Check all items are in valid completion states
      const pendingItems = items.filter((item) => item.status === "pending");
      if (pendingItems.length > 0) {
        const error = new Error(
          "Cannot complete stop: all items must be verified, skipped, disputed, or exception"
        );
        (error as Error & { statusCode?: number; route_stop_id?: string; pending_items?: string[] }).statusCode = 409;
        (error as Error & { route_stop_id?: string; pending_items?: string[] }).route_stop_id = route_stop_id;
        (error as Error & { pending_items?: string[] }).pending_items = pendingItems.map((item) => item.id);
        throw error;
      }

      // Determine completion status based on item states
      const hasExceptions = items.some((item) =>
        ["disputed", "exception"].includes(item.status)
      );

      const newStatus = hasExceptions ? "completed_with_exceptions" : "completed";

      // Attempt update - trigger will validate
      const { error: updateError } = await adminClient
        .from("route_stops")
        .update({
          status: newStatus,
          completed_at: new Date().toISOString(),
        })
        .eq("id", route_stop_id);

      if (updateError) {
        // Check if it's a validation error from trigger
        if (updateError.message.includes("Cannot complete stop") ||
            updateError.message.includes("Invalid status transition")) {
          const error = new Error(updateError.message);
          (error as Error & { statusCode?: number; route_stop_id?: string }).statusCode = 409;
          (error as Error & { route_stop_id?: string }).route_stop_id = route_stop_id;
          throw error;
        }
        throw new Error(`Failed to complete stop: ${updateError.message}`);
      }

      const deliveredRugIds = (items ?? [])
        .filter((item) => item.phase === "delivery" && item.status === "verified" && item.rug_id)
        .map((item) => item.rug_id) as string[];

      if (deliveredRugIds.length > 0) {
        const { error: rugUpdateError } = await adminClient
          .from("rugs")
          .update({
            status: "picked_up",
            picked_up_at: new Date().toISOString(),
          })
          .in("id", deliveredRugIds)
          .eq("status", "ready");

        if (rugUpdateError) {
          throw new Error(`Failed to update delivered rugs: ${rugUpdateError.message}`);
        }
      }

      break;
    }

    case "STOP_UNABLE_TO_COMPLETE": {
      const exceptionCode = typeof payload?.exception_code === "string"
        ? payload.exception_code
        : null;
      const notes = typeof payload?.notes === "string" ? payload.notes : "";

      if (!exceptionCode) {
        throw new Error("STOP_UNABLE_TO_COMPLETE event requires exception_code in payload");
      }

      const { error } = await adminClient
        .from("route_stops")
        .update({
          status: "unable_to_complete",
          exception_code: exceptionCode,
          notes: notes || undefined,
        })
        .eq("id", route_stop_id);

      if (error) throw new Error(`Failed to mark stop as unable to complete: ${error.message}`);
      break;
    }

    default:
      console.warn(`Unknown event type: ${event_type}`);
      // Don't throw - allow unknown events to be stored but not processed
      break;
  }
}

/**
 * Verify if an event's effect was already applied to the database
 * This is used for idempotency when an event was inserted but effect application may have failed
 */
async function verifyEventEffectApplied(
  adminClient: ReturnType<typeof createClient>,
  event: StopEvent
): Promise<boolean> {
  const { route_stop_id, event_type, payload } = event;

  switch (event_type) {
    case "STOP_STARTED": {
      const { data: stop } = await adminClient
        .from("route_stops")
        .select("status, started_at")
        .eq("id", route_stop_id)
        .single();
      return stop?.status === "in_progress" && stop?.started_at != null;
    }

    case "SIGNATURE_SET": {
      const signatureDataUrl = typeof payload?.signature_data_url === "string"
        ? payload.signature_data_url
        : null;
      if (!signatureDataUrl) return false;
      const { data: stop } = await adminClient
        .from("route_stops")
        .select("signature_data_url")
        .eq("id", route_stop_id)
        .single();
      return stop?.signature_data_url === signatureDataUrl;
    }

    case "ITEM_VERIFIED": {
      const itemId = typeof payload?.route_stop_item_id === "string"
        ? payload.route_stop_item_id
        : null;
      if (!itemId) return false;
      const { data: item } = await adminClient
        .from("route_stop_items")
        .select("status")
        .eq("id", itemId)
        .single();
      return item?.status === "verified";
    }

    case "ITEM_SKIPPED": {
      const itemId = typeof payload?.route_stop_item_id === "string"
        ? payload.route_stop_item_id
        : null;
      if (!itemId) return false;
      const { data: item } = await adminClient
        .from("route_stop_items")
        .select("status")
        .eq("id", itemId)
        .single();
      return item?.status === "skipped";
    }

    case "ITEM_EXCEPTION": {
      const itemId = typeof payload?.route_stop_item_id === "string"
        ? payload.route_stop_item_id
        : null;
      if (!itemId) return false;
      const { data: item } = await adminClient
        .from("route_stop_items")
        .select("status")
        .eq("id", itemId)
        .single();
      return item?.status === "exception";
    }

    case "ITEM_DISPUTED": {
      const itemId = typeof payload?.route_stop_item_id === "string"
        ? payload.route_stop_item_id
        : null;
      if (!itemId) return false;
      const { data: item } = await adminClient
        .from("route_stop_items")
        .select("status, rug_id")
        .eq("id", itemId)
        .single();
      // Check if item is disputed
      if (item?.status !== "disputed") return false;
      // Check if dispute record exists for this rug
      if (!item.rug_id) return false;
      const disputeType = typeof payload?.dispute_type === "string" ? payload.dispute_type : null;
      const { data: dispute } = await adminClient
        .from("disputes")
        .select("id")
        .eq("rug_id", item.rug_id)
        .eq("type", disputeType || "refused_delivery") // Default check
        .maybeSingle();
      return dispute != null;
    }

    case "PHOTO_ATTACHED": {
      const itemId = typeof payload?.route_stop_item_id === "string"
        ? payload.route_stop_item_id
        : null;
      const photoUrl = typeof payload?.photo_url === "string" ? payload.photo_url : null;
      if (!itemId || !photoUrl) return false;
      const { data: item } = await adminClient
        .from("route_stop_items")
        .select("photo_urls")
        .eq("id", itemId)
        .single();
      const photoUrls = (item?.photo_urls ?? []) as string[];
      return photoUrls.includes(photoUrl);
    }

    case "STOP_COMPLETED": {
      const { data: stop } = await adminClient
        .from("route_stops")
        .select("status")
        .eq("id", route_stop_id)
        .single();

      if (!(stop?.status === "completed" || stop?.status === "completed_with_exceptions")) {
        return false;
      }

      const { data: items } = await adminClient
        .from("route_stop_items")
        .select("status, phase, rug_id")
        .eq("route_stop_id", route_stop_id);

      const deliveredRugIds = (items ?? [])
        .filter((item) => item.phase === "delivery" && item.status === "verified" && item.rug_id)
        .map((item) => item.rug_id) as string[];

      if (deliveredRugIds.length === 0) {
        return true;
      }

      const { data: rugs } = await adminClient
        .from("rugs")
        .select("id, status")
        .in("id", deliveredRugIds);

      return (rugs ?? []).every((rug) => rug.status === "picked_up");
    }

    case "STOP_UNABLE_TO_COMPLETE": {
      const { data: stop } = await adminClient
        .from("route_stops")
        .select("status")
        .eq("id", route_stop_id)
        .single();
      return stop?.status === "unable_to_complete";
    }

    default:
      // For unknown event types, assume effect was applied if event exists
      return true;
  }
}
