import { useState, useEffect, useCallback } from "react";
import {
  getPendingEventCount,
  getPendingEventCountForStop,
  addEvent as addEventToQueue,
  type OfflineEvent,
} from "@/lib/offline-queue";
import { performFullSync, isOnline, startAutoSync } from "@/lib/offline-sync";

export interface OfflineQueueState {
  pendingCount: number;
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncResult: Awaited<ReturnType<typeof performFullSync>> | null;
}

export function useOfflineQueue() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnlineState, setIsOnlineState] = useState(isOnline());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<Awaited<ReturnType<typeof performFullSync>> | null>(null);

  // Update pending count
  const updatePendingCount = useCallback(async () => {
    const count = await getPendingEventCount();
    setPendingCount(count);
  }, []);

  // Manual sync
  const sync = useCallback(async () => {
    if (!isOnline()) {
      return;
    }
    setIsSyncing(true);
    try {
      const result = await performFullSync();
      setLastSyncResult(result);
      await updatePendingCount();
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [updatePendingCount]);

  // Add event to queue
  const addEvent = useCallback(
    async (route_stop_id: string, event_type: string, payload: Record<string, unknown> = {}) => {
      const offline_event_id = await addEventToQueue(route_stop_id, event_type, payload);
      await updatePendingCount();
      return offline_event_id;
    },
    [updatePendingCount]
  );

  // Get pending count for a specific stop
  const getStopPendingCount = useCallback(async (route_stop_id: string) => {
    return await getPendingEventCountForStop(route_stop_id);
  }, []);

  // Set up auto-sync and online/offline listeners
  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnlineState(isOnline());
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    // Start auto-sync
    const cleanup = startAutoSync((result) => {
      setLastSyncResult(result);
      void updatePendingCount();
    });

    // Initial pending count
    void updatePendingCount();

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      cleanup();
    };
  }, [updatePendingCount]);

  return {
    pendingCount,
    isOnline: isOnlineState,
    isSyncing,
    lastSyncResult,
    sync,
    addEvent,
    getStopPendingCount,
    updatePendingCount,
  };
}
