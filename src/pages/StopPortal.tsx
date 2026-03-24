import React, { useState } from "react";
import {
  Truck,
  Map,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/states/PageState";
import { TruckLoadingView } from "@/components/driver/TruckLoadingView";
import { RouteListView } from "@/components/driver/RouteListView";
import { StopDetailView } from "@/components/driver/StopDetailView";
import { DisputeDialog } from "@/components/driver/DisputeDialog";
import { ExceptionDialog } from "@/components/driver/ExceptionDialog";
import { useRouteStops } from "@/hooks/useRouteStops";
import { DRIVER_TITLE } from "@/lib/branding";

type DriverTab = "truck" | "route" | "stop";

const StopPortal: React.FC = () => {
  const {
    loading,
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
    fetchStops,
    startStop,
    toggleItemVerified,
    setItemNotes,
    addItemPhoto,
    setSignature,
    completeStop,
    handleDispute,
    handleException,
  } = useRouteStops();

  const [activeTab, setActiveTab] = useState<DriverTab>("truck");
  const [showDisputeDialog, setShowDisputeDialog] = useState<{ itemId: string; phase: "delivery" | "pickup" } | null>(null);
  const [showExceptionDialog, setShowExceptionDialog] = useState<{ itemId: string } | null>(null);

  const allStops = [...inProgress, ...queued, ...completed];

  const handleSelectStop = (stopId: string) => {
    setActiveStopId(stopId);
    setActiveTab("stop");
  };

  const handleStartAndSelect = async (stopId: string) => {
    await startStop(stopId);
    handleSelectStop(stopId);
  };

  const handleBackFromStop = () => {
    setActiveStopId(null);
    setActiveTab("route");
  };

  if (loading) {
    return (
      <div className="app-page flex min-h-screen items-center justify-center">
        <LoadingState title="Loading" description="Preparing your route..." className="w-full max-w-lg" />
      </div>
    );
  }

  // When a stop is active, show the stop detail (full screen, no tabs)
  if (activeTab === "stop" && activeStop) {
    return (
      <>
        <StopDetailView
          stop={activeStop}
          isOnline={isOnline}
          onBack={handleBackFromStop}
          onStartStop={() => startStop(activeStop.id)}
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
  }

  return (
    <div className="min-h-screen bg-background/70 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-10 mx-2 mt-2 rounded-3xl border border-white/20 bg-primary/95 p-4 text-primary-foreground shadow-[0_20px_45px_-30px_rgba(15,23,42,0.7)] backdrop-blur-xl shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            <h1 className="text-lg font-semibold">{DRIVER_TITLE}</h1>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <div className="flex items-center gap-1 text-xs">
                <WifiOff className="h-4 w-4" />
                <span>Offline</span>
              </div>
            )}
            {pendingCount > 0 && (
              <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => void sync()}>
                <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
                Sync ({pendingCount})
              </Button>
            )}
            <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => void signOut()}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-auto px-2 pb-2 pt-3">
        {activeTab === "truck" && (
          <TruckLoadingView
            isOnline={isOnline}
            onTruckFinalized={() => { void fetchStops(); setActiveTab("route"); }}
          />
        )}
        {activeTab === "route" && (
          <RouteListView
            stops={allStops}
            onSelectStop={handleSelectStop}
            onStartStop={(stopId) => void handleStartAndSelect(stopId)}
          />
        )}
      </div>

      {/* Bottom Tab Navigation */}
      <nav className="sticky bottom-0 z-10 mx-2 mb-2 overflow-hidden rounded-3xl border border-border/70 bg-card/95 shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)] backdrop-blur-xl shrink-0 safe-area-bottom">
        <div className="flex">
          {([
            { id: "truck" as DriverTab, label: "Load Truck", icon: Truck },
            { id: "route" as DriverTab, label: "Route", icon: Map },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badge = tab.id === "route" ? inProgress.length : 0;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-3 px-2 min-h-[56px] transition-colors ${
                  isActive
                    ? "text-primary border-t-2 border-primary bg-primary/5"
                    : "text-muted-foreground"
                }`}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-2 h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                      {badge}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default StopPortal;
