import { supabase } from "@/integrations/supabase/client";
import {
  getPendingEvents,
  markEventSynced,
  markEventFailed,
  getPendingPhotos,
  markPhotoUploaded,
  type OfflineEvent,
  type PendingPhoto,
} from "./offline-queue";

const BATCH_SIZE = 10; // Process events in batches
const PHOTO_BATCH_SIZE = 5; // Process photos in batches
const SYNC_INTERVAL_MS = 5000; // Sync every 5 seconds when online
const MAX_PHOTO_RETRIES = 3;
const PHOTO_RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff delays

/**
 * Upload a photo to Supabase storage and return public URL
 */
async function uploadPhoto(photo: PendingPhoto): Promise<string> {
  // Use pickup-photos bucket for now (can create delivery-photos bucket later)
  const bucket = "pickup-photos";
  const path = `${photo.route_stop_id}/${photo.route_stop_item_id}/${Date.now()}-${photo.file_name.replace(/\s+/g, "-")}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, photo.file_data, {
    upsert: false,
  });

  if (uploadError) {
    throw new Error(`Photo upload failed: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return publicUrlData.publicUrl;
}

/**
 * Upload a photo with retry logic and exponential backoff.
 */
async function uploadPhotoWithRetry(photo: PendingPhoto): Promise<string> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= MAX_PHOTO_RETRIES; attempt++) {
    try {
      return await uploadPhoto(photo);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < MAX_PHOTO_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, PHOTO_RETRY_DELAYS[attempt]));
      }
    }
  }
  throw lastError;
}

/**
 * Sync pending photos in batches with retry logic.
 */
export async function syncPendingPhotos(): Promise<{ uploaded: number; failed: number }> {
  const pendingPhotos = await getPendingPhotos();
  let uploaded = 0;
  let failed = 0;

  // Process photos in batches
  for (let i = 0; i < pendingPhotos.length; i += PHOTO_BATCH_SIZE) {
    const batch = pendingPhotos.slice(i, i + PHOTO_BATCH_SIZE);

    for (const photo of batch) {
      if (photo.id == null) {
        console.error("Skipping photo with missing id");
        failed++;
        continue;
      }

      try {
        const publicUrl = await uploadPhotoWithRetry(photo);
        await markPhotoUploaded(photo.id, publicUrl);

        // Emit PHOTO_ATTACHED event — if this fails, the photo is still marked
        // uploaded but the event won't be created. We catch and log so the photo
        // upload is not lost.
        try {
          const { addEvent } = await import("./offline-queue");
          await addEvent(photo.route_stop_id, "PHOTO_ATTACHED", {
            route_stop_item_id: photo.route_stop_item_id,
            photo_url: publicUrl,
          });
        } catch (eventError) {
          console.error(`Photo ${photo.id} uploaded but PHOTO_ATTACHED event failed:`, eventError);
        }

        uploaded++;
      } catch (error) {
        console.error(`Failed to upload photo ${photo.id} after ${MAX_PHOTO_RETRIES} retries:`, error);
        failed++;
      }
    }
  }

  return { uploaded, failed };
}

/**
 * Sync pending events to the ingest-stop-events function
 */
export async function syncPendingEvents(): Promise<{
  synced: number;
  failed: number;
  errors: Array<{ offline_event_id: string; error: string }>;
}> {
  const pendingEvents = await getPendingEvents();
  if (pendingEvents.length === 0) {
    return { synced: 0, failed: 0, errors: [] };
  }

  // Group events by route_stop_id for batch processing
  const eventsByStop: Record<string, OfflineEvent[]> = {};
  for (const event of pendingEvents) {
    if (!eventsByStop[event.route_stop_id]) {
      eventsByStop[event.route_stop_id] = [];
    }
    eventsByStop[event.route_stop_id].push(event);
  }

  let synced = 0;
  let failed = 0;
  const errors: Array<{ offline_event_id: string; error: string }> = [];

  // Process stops in batches
  const stopIds = Object.keys(eventsByStop);
  for (let i = 0; i < stopIds.length; i += BATCH_SIZE) {
    const batchStopIds = stopIds.slice(i, i + BATCH_SIZE);

    for (const stopId of batchStopIds) {
      const stopEvents = eventsByStop[stopId];
      const eventsPayload = stopEvents.map((e) => ({
        offline_event_id: e.offline_event_id,
        route_stop_id: e.route_stop_id,
        event_type: e.event_type,
        payload: e.payload,
      }));

      try {
        const { data, error } = await supabase.functions.invoke("ingest-stop-events", {
          body: { events: eventsPayload },
        });

        if (error) {
          throw error;
        }

        if (data?.error) {
          // Handle completion failure (409)
          if (data.error.includes("Cannot complete stop")) {
            // Mark events as failed but don't retry automatically
            for (const event of stopEvents) {
              await markEventFailed(event.offline_event_id, data.error);
              failed++;
              errors.push({ offline_event_id: event.offline_event_id, error: data.error });
            }
            continue;
          }
          throw new Error(data.error);
        }

        // Mark all events as synced
        for (const event of stopEvents) {
          await markEventSynced(event.offline_event_id);
          synced++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Failed to sync events for stop ${stopId}:`, error);

        // Mark events as failed (will retry later)
        for (const event of stopEvents) {
          await markEventFailed(event.offline_event_id, errorMessage);
          failed++;
          errors.push({ offline_event_id: event.offline_event_id, error: errorMessage });
        }
      }
    }
  }

  return { synced, failed, errors };
}

/**
 * Full sync: photos first, then events
 */
export async function performFullSync(): Promise<{
  photos: { uploaded: number; failed: number };
  events: { synced: number; failed: number; errors: Array<{ offline_event_id: string; error: string }> };
}> {
  const photos = await syncPendingPhotos();
  const events = await syncPendingEvents();
  return { photos, events };
}

/**
 * Check if device is online
 */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

/**
 * Start automatic sync (runs on interval and online event)
 */
export function startAutoSync(
  onSyncComplete?: (result: Awaited<ReturnType<typeof performFullSync>>) => void
): () => void {
  let intervalId: number | null = null;

  const sync = async () => {
    if (!isOnline()) return;
    try {
      const result = await performFullSync();
      onSyncComplete?.(result);
    } catch (error) {
      console.error("Auto sync failed:", error);
    }
  };

  // Sync on interval
  intervalId = window.setInterval(sync, SYNC_INTERVAL_MS);

  // Sync on online event
  const handleOnline = () => {
    void sync();
  };
  window.addEventListener("online", handleOnline);

  // Initial sync
  void sync();

  // Return cleanup function
  return () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
    }
    window.removeEventListener("online", handleOnline);
  };
}
