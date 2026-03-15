import React, { useState } from "react";
import { LoadingState } from "@/components/states/PageState";
import { StopListView } from "@/components/driver/StopListView";
import { StopDetailView } from "@/components/driver/StopDetailView";
import { DisputeDialog } from "@/components/driver/DisputeDialog";
import { ExceptionDialog } from "@/components/driver/ExceptionDialog";
import { useRouteStops } from "@/hooks/useRouteStops";

const StopPortal: React.FC = () => {
  const {
    loading,
    activeStopId,
    setActiveStopId,
    activeStop,
    queued,
    inProgress,
    completed,
    isOnline,
    pendingCount,
    isSyncing,
    sync,
    signOut,
    startStop,
    toggleItemVerified,
    setItemNotes,
    addItemPhoto,
    setSignature,
    finalizeTruck,
    completeStop,
    handleDispute,
    handleException,
  } = useRouteStops();

  const [showDisputeDialog, setShowDisputeDialog] = useState<{ itemId: string; phase: "delivery" | "pickup" } | null>(null);
  const [showExceptionDialog, setShowExceptionDialog] = useState<{ itemId: string } | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <LoadingState title="Loading stops" description="Preparing your assigned route..." className="w-full max-w-lg" />
      </div>
    );
  }

  if (!activeStop) {
    return (
      <StopListView
        queued={queued}
        inProgress={inProgress}
        completed={completed}
        isOnline={isOnline}
        pendingCount={pendingCount}
        isSyncing={isSyncing}
        onSync={() => void sync()}
        onSignOut={() => void signOut()}
        onSelectStop={setActiveStopId}
      />
    );
  }

  return (
    <>
      <StopDetailView
        stop={activeStop}
        isOnline={isOnline}
        onBack={() => setActiveStopId(null)}
        onSignOut={() => void signOut()}
        onStartStop={() => startStop(activeStop.id)}
        onFinalizeTruck={() => finalizeTruck(activeStop.id)}
        onCompleteStop={() => completeStop(activeStop.id)}
        onVerifyItem={(itemId) => toggleItemVerified(activeStop.id, itemId)}
        onItemNotes={(itemId, notes) => setItemNotes(activeStop.id, itemId, notes)}
        onItemPhoto={(itemId, file) => addItemPhoto(activeStop.id, itemId, file)}
        onItemDispute={(itemId, phase) => setShowDisputeDialog({ itemId, phase })}
        onItemException={(itemId) => setShowExceptionDialog({ itemId })}
        onSignature={(dataUrl) => setSignature(activeStop.id, dataUrl)}
      />

      <DisputeDialog
        open={showDisputeDialog !== null}
        onOpenChange={(open) => !open && setShowDisputeDialog(null)}
        phase={showDisputeDialog?.phase ?? "delivery"}
        onDispute={(disputeType) => {
          if (showDisputeDialog) {
            handleDispute(activeStop.id, showDisputeDialog.itemId, showDisputeDialog.phase, disputeType);
            setShowDisputeDialog(null);
          }
        }}
      />

      <ExceptionDialog
        open={showExceptionDialog !== null}
        onOpenChange={(open) => !open && setShowExceptionDialog(null)}
        onSave={(code, notes) => {
          if (showExceptionDialog) {
            handleException(activeStop.id, showExceptionDialog.itemId, code, notes);
            setShowExceptionDialog(null);
          }
        }}
      />
    </>
  );
};

export default StopPortal;
