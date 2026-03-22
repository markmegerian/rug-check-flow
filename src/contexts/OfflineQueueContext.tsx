import React, { createContext, useContext, type ReactNode } from "react";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";

type OfflineQueueContextValue = ReturnType<typeof useOfflineQueue>;

const OfflineQueueContext = createContext<OfflineQueueContextValue | undefined>(undefined);

export function OfflineQueueProvider({ children }: { children: ReactNode }) {
  const queue = useOfflineQueue();

  return <OfflineQueueContext.Provider value={queue}>{children}</OfflineQueueContext.Provider>;
}

export function useOfflineQueueContext() {
  const context = useContext(OfflineQueueContext);
  if (context === undefined) {
    throw new Error("useOfflineQueueContext must be used within OfflineQueueProvider");
  }
  return context;
}
