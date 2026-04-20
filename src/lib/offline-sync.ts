import { supabase } from "@/integrations/supabase/client";
import type { OfflineEvent, PendingPhoto } from "./offline-queue";
import { logger } from "./logger";
import { classifyRpcError } from "./rpc-errors";

const BATCH_SIZE = 10;
const BASE_SYNC_INTERVAL_MS = 5000;
const MAX_SYNC_INTERVAL_MS = 60000;
const BACKOFF_MULTIPLIER = 2;

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
 * Sync pending photos
 */
export async function syncPendingPhotos(): Promise<{ uploaded: number; failed: number }> {
  const { getPendingPhotos, markPhotoUploaded } = await import("./offline-queue");
  const pendingPhotos = await getPendingPhotos();
  let uploaded = 0;
  let failed = 0;

  for (const photo of pendingPhotos) {
    try {
      const publicUrl = await uploadPhoto(photo);
      await markPhotoUploaded(photo.id!, publicUrl);

      // Emit PHOTO_ATTACHED event
      const { addEvent } = await import("./offline-queue");
      await addEvent(photo.route_stop_id, "PHOTO_ATTACHED", {
        route_stop_item_id: photo.route_stop_item_id,
        photo_url: publicUrl,
      });

      uploaded++;
    } catch (error) {
      logger.error("offline_photo_upload_failed", error, { photoId: photo.id });
      failed++;
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
  const { getPendingEvents, markEventSynced, markEventFailed } = await import("./offline-queue");
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
          const classified = classifyRpcError(data.error);
          if (!classified.retryable) {
            for (const event of stopEvents) {
              await markEventFailed(event.offline_event_id, classified.message);
              failed++;
              errors.push({ offline_event_id: event.offline_event_id, error: classified.message });
            }
            logger.warn("offline_event_batch_rejected", {
              stopId,
              kind: classified.kind,
              message: classified.message,
              count: stopEvents.length,
            });
            continue;
          }
          throw new Error(classified.message);
        }

        // Mark all events as synced
        for (const event of stopEvents) {
          await markEventSynced(event.offline_event_id);
          synced++;
        }
      } catch (error) {
        const classified = classifyRpcError(error);
        logger.error("offline_event_batch_failed", error, {
          stopId,
          kind: classified.kind,
          count: stopEvents.length,
        });

        for (const event of stopEvents) {
          await markEventFailed(event.offline_event_id, classified.message);
          failed++;
          errors.push({ offline_event_id: event.offline_event_id, error: classified.message });
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
 * Start automatic sync with exponential backoff on failures.
 * Interval starts at 5s and doubles on consecutive failures up to 60s.
 * Resets to base interval on any successful sync.
 */
export function startAutoSync(
  onSyncComplete?: (result: Awaited<ReturnType<typeof performFullSync>>) => void
): () => void {
  let timeoutId: number | null = null;
  let currentInterval = BASE_SYNC_INTERVAL_MS;
  let stopped = false;

  const scheduleNext = () => {
    if (stopped) return;
    timeoutId = window.setTimeout(sync, currentInterval);
  };

  const sync = async () => {
    if (!isOnline()) {
      scheduleNext();
      return;
    }
    try {
      const result = await performFullSync();
      currentInterval = BASE_SYNC_INTERVAL_MS;
      onSyncComplete?.(result);
    } catch (error) {
      logger.error("offline_auto_sync_failed", error);
      currentInterval = Math.min(currentInterval * BACKOFF_MULTIPLIER, MAX_SYNC_INTERVAL_MS);
    }
    scheduleNext();
  };

  const handleOnline = () => {
    currentInterval = BASE_SYNC_INTERVAL_MS;
    void sync();
  };
  window.addEventListener("online", handleOnline);

  // Cleanup old synced data on startup
  void import("./offline-queue").then(({ clearOldSyncedEvents, clearOldUploadedPhotos }) => {
    void clearOldSyncedEvents().catch(() => {});
    void clearOldUploadedPhotos().catch(() => {});
  });

  // Initial sync
  void sync();

  return () => {
    stopped = true;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    window.removeEventListener("online", handleOnline);
  };
}
