import Dexie, { type Table } from "dexie";

export interface OfflineEvent {
  id?: number;
  offline_event_id: string;
  route_stop_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  synced_at: string | null;
  retry_count: number;
  error_message: string | null;
}

export interface PendingPhoto {
  id?: number;
  route_stop_id: string;
  route_stop_item_id: string;
  file_name: string;
  file_data: Blob;
  created_at: string;
  uploaded_at: string | null;
  public_url: string | null;
}

class OfflineQueueDB extends Dexie {
  events!: Table<OfflineEvent>;
  photos!: Table<PendingPhoto>;

  constructor() {
    super("OfflineQueueDB");
    this.version(1).stores({
      events: "++id, offline_event_id, route_stop_id, synced_at, created_at",
      photos: "++id, route_stop_id, route_stop_item_id, uploaded_at, created_at",
    });
  }
}

const db = new OfflineQueueDB();

/** Detect IndexedDB quota-exceeded errors across browsers. */
function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof DOMException) {
    // Standard name and legacy code
    return error.name === "QuotaExceededError" || error.code === 22;
  }
  if (error instanceof Error) {
    return error.message.toLowerCase().includes("quota");
  }
  return false;
}

/**
 * Add an event to the offline queue.
 * Wraps IndexedDB writes with quota-exceeded handling.
 */
export async function addEvent(
  route_stop_id: string,
  event_type: string,
  payload: Record<string, unknown> = {}
): Promise<string> {
  const offline_event_id = crypto.randomUUID();
  const event: OfflineEvent = {
    offline_event_id,
    route_stop_id,
    event_type,
    payload,
    created_at: new Date().toISOString(),
    synced_at: null,
    retry_count: 0,
    error_message: null,
  };

  try {
    await db.events.add(event);
  } catch (error) {
    if (isQuotaExceededError(error)) {
      // Attempt to free space by clearing old synced data, then retry once
      await clearOldSyncedEvents();
      await clearOldUploadedPhotos();
      await db.events.add(event);
    } else {
      throw error;
    }
  }
  return offline_event_id;
}

/**
 * Get all pending (unsynced) events
 */
export async function getPendingEvents(): Promise<OfflineEvent[]> {
  return await db.events
    .filter((event) => event.synced_at === null)
    .sortBy("created_at");
}

/**
 * Get pending events for a specific stop
 */
export async function getPendingEventsForStop(route_stop_id: string): Promise<OfflineEvent[]> {
  return await db.events
    .where("route_stop_id")
    .equals(route_stop_id)
    .and((event) => event.synced_at === null)
    .sortBy("created_at");
}

/**
 * Mark an event as synced
 */
export async function markEventSynced(offline_event_id: string): Promise<void> {
  await db.events
    .where("offline_event_id")
    .equals(offline_event_id)
    .modify({ synced_at: new Date().toISOString(), error_message: null });
}

/**
 * Mark an event as failed (increment retry count)
 */
export async function markEventFailed(offline_event_id: string, error_message: string): Promise<void> {
  const event = await db.events.where("offline_event_id").equals(offline_event_id).first();
  if (event) {
    await db.events.update(event.id!, {
      retry_count: event.retry_count + 1,
      error_message,
    });
  }
}

/**
 * Get count of pending events
 */
export async function getPendingEventCount(): Promise<number> {
  const pending = await db.events.filter((e) => e.synced_at === null).toArray();
  return pending.length;
}

/**
 * Get count of pending events for a specific stop
 */
export async function getPendingEventCountForStop(route_stop_id: string): Promise<number> {
  return await db.events
    .where("route_stop_id")
    .equals(route_stop_id)
    .and((event) => event.synced_at === null)
    .count();
}

/**
 * Clear old synced events (older than 7 days)
 */
export async function clearOldSyncedEvents(): Promise<void> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const oldEvents = await db.events
      .where("synced_at")
      .below(sevenDaysAgo.toISOString())
      .toArray();

    const ids = oldEvents.map((e) => e.id).filter((id): id is number => id != null);
    if (ids.length > 0) {
      await db.events.bulkDelete(ids);
    }
  } catch (error) {
    console.error("Failed to clear old synced events:", error);
  }
}

/**
 * Add a photo to the pending upload queue
 */
export async function addPendingPhoto(
  route_stop_id: string,
  route_stop_item_id: string,
  file: File
): Promise<number> {
  const photo: PendingPhoto = {
    route_stop_id,
    route_stop_item_id,
    file_name: file.name,
    file_data: file,
    created_at: new Date().toISOString(),
    uploaded_at: null,
    public_url: null,
  };

  try {
    return await db.photos.add(photo) as number;
  } catch (error) {
    if (isQuotaExceededError(error)) {
      await clearOldSyncedEvents();
      await clearOldUploadedPhotos();
      return await db.photos.add(photo) as number;
    }
    throw error;
  }
}

/**
 * Get pending photos for a specific item
 */
export async function getPendingPhotosForItem(route_stop_item_id: string): Promise<PendingPhoto[]> {
  return await db.photos
    .where("route_stop_item_id")
    .equals(route_stop_item_id)
    .and((photo) => photo.uploaded_at === null)
    .sortBy("created_at");
}

/**
 * Mark a photo as uploaded
 */
export async function markPhotoUploaded(photo_id: number, public_url: string): Promise<void> {
  await db.photos.update(photo_id, {
    uploaded_at: new Date().toISOString(),
    public_url,
  });
}

/**
 * Get all pending photos
 */
export async function getPendingPhotos(): Promise<PendingPhoto[]> {
  return await db.photos
    .filter((photo) => photo.uploaded_at === null)
    .sortBy("created_at");
}

/**
 * Clear old uploaded photos (older than 7 days)
 */
export async function clearOldUploadedPhotos(): Promise<void> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const oldPhotos = await db.photos
      .where("uploaded_at")
      .below(sevenDaysAgo.toISOString())
      .toArray();

    const ids = oldPhotos.map((p) => p.id).filter((id): id is number => id != null);
    if (ids.length > 0) {
      await db.photos.bulkDelete(ids);
    }
  } catch (error) {
    console.error("Failed to clear old uploaded photos:", error);
  }
}
