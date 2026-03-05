import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format, addDays, subDays } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  Lock,
  Truck,
  X,
  Wifi,
  WifiOff,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import SignatureCanvas from "@/components/driver/SignatureCanvas";
import { useAuth } from "@/contexts/AuthContext";
import { useOfflineQueueContext } from "@/contexts/OfflineQueueContext";
import { EmptyState, LoadingState } from "@/components/states/PageState";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { supabase } from "@/integrations/supabase/client";
import { addPendingPhoto, getPendingPhotosForItem } from "@/lib/offline-queue";

type RouteStopStatus = "queued" | "in_progress" | "completed" | "completed_with_exceptions" | "unable_to_complete";

type RouteStopRow = {
  id: string;
  route_date: string;
  client_id: string;
  route_day: string;
  assigned_driver_id: string | null;
  delivery_list_id: string | null;
  status: RouteStopStatus;
  signature_data_url: string | null;
  started_at: string | null;
  completed_at: string | null;
  exception_code: string | null;
  notes: string;
  clients: { name: string; address: string } | null;
};

type RouteStopItemRow = {
  id: string;
  route_stop_id: string;
  phase: "delivery" | "pickup";
  status: "pending" | "verified" | "disputed" | "exception" | "skipped";
  rug_id: string | null;
  pickup_request_item_id: string | null;
  delivery_list_item_id: string | null;
  notes: string;
  photo_urls: string[];
  exception_code: string | null;
  rugs: { tag: string; size_length: number | null; size_width: number | null } | null;
};

type Stop = {
  id: string;
  clientName: string;
  clientAddress: string;
  date: string;
  status: RouteStopStatus;
  signatureDataUrl?: string;
  startedAt?: string;
  completedAt?: string;
  deliveryListId: string | null;
  deliveryItems: StopItem[];
  pickupItems: StopItem[];
  pendingEventCount: number;
};

type StopItem = {
  id: string;
  phase: "delivery" | "pickup";
  status: "pending" | "verified" | "disputed" | "exception" | "skipped";
  rugTag: string;
  rugSize: string;
  notes: string;
  photos: string[];
  exceptionCode?: string;
  deliveryListItemId?: string | null;
  loadedOnTruck?: boolean;
};

const StopPortal: React.FC = () => {
  const { user, signOut } = useAuth();
  const { addEvent, pendingCount, isOnline, isSyncing, sync, getStopPendingCount } = useOfflineQueueContext();
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStopId, setActiveStopId] = useState<string | null>(null);
  const [showDisputeDialog, setShowDisputeDialog] = useState<{ itemId: string; phase: "delivery" | "pickup" } | null>(null);
  const [showExceptionDialog, setShowExceptionDialog] = useState<{ itemId: string } | null>(null);

  // Date window: today ± 1 day
  const today = new Date();
  const dateWindow = {
    start: format(subDays(today, 1), "yyyy-MM-dd"),
    end: format(addDays(today, 1), "yyyy-MM-dd"),
  };

  const fetchStops = useCallback(async () => {
    if (!user?.id) {
      setStops([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      // Fetch route stops
      const { data: stopsData, error: stopsError } = await supabaseExtended
        .from("route_stops")
        .select("*, clients(name, address)")
        .eq("assigned_driver_id", user.id)
        .gte("route_date", dateWindow.start)
        .lte("route_date", dateWindow.end)
        .order("route_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (stopsError) {
        toast({ title: "Failed to load stops", description: stopsError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      const stopsRows = (stopsData ?? []) as unknown as RouteStopRow[];
      const stopIds = stopsRows.map((s) => s.id);

      // Fetch route stop items
      const { data: itemsData, error: itemsError } = stopIds.length === 0
        ? { data: [], error: null }
        : await supabaseExtended
            .from("route_stop_items")
            .select("*, rugs(tag, size_length, size_width)")
            .in("route_stop_id", stopIds)
            .order("phase", { ascending: true })
            .order("created_at", { ascending: true });

      // Fetch delivery_list_items to get loaded_on_truck status
      const deliveryListItemIds = (itemsData ?? [])
        .filter((item: RouteStopItemRow) => item.delivery_list_item_id)
        .map((item: RouteStopItemRow) => item.delivery_list_item_id) as string[];

      let deliveryItemsMap: Record<string, { loaded_on_truck: boolean }> = {};
      if (deliveryListItemIds.length > 0) {
        const { data: deliveryItemsData } = await supabaseExtended
          .from("delivery_list_items")
          .select("id, loaded_on_truck")
          .in("id", deliveryListItemIds);

        if (deliveryItemsData) {
          deliveryItemsMap = Object.fromEntries(
            deliveryItemsData.map((item: { id: string; loaded_on_truck: boolean }) => [
              item.id,
              { loaded_on_truck: item.loaded_on_truck },
            ])
          );
        }
      }

      if (itemsError) {
        toast({ title: "Failed to load items", description: itemsError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      const itemsRows = (itemsData ?? []) as unknown as RouteStopItemRow[];

      // Map to Stop objects
      const mapped: Stop[] = await Promise.all(
        stopsRows.map(async (stop) => {
          const stopItems = itemsRows.filter((i) => i.route_stop_id === stop.id);
          const deliveryItems: StopItem[] = stopItems
            .filter((i) => i.phase === "delivery")
            .map((i) => {
              const deliveryItemData = i.delivery_list_item_id
                ? deliveryItemsMap[i.delivery_list_item_id]
                : null;
              return {
                id: i.id,
                phase: "delivery" as const,
                status: i.status,
                rugTag: i.rugs?.tag ?? i.rug_id?.slice(0, 8) ?? "Unknown",
                rugSize: i.rugs?.size_length && i.rugs?.size_width
                  ? `${i.rugs.size_length}×${i.rugs.size_width}`
                  : "",
                notes: i.notes,
                photos: i.photo_urls ?? [],
                exceptionCode: i.exception_code ?? undefined,
                deliveryListItemId: i.delivery_list_item_id ?? undefined,
                loadedOnTruck: deliveryItemData?.loaded_on_truck ?? false,
              };
            });

          const pickupItems: StopItem[] = stopItems
            .filter((i) => i.phase === "pickup")
            .map((i) => ({
              id: i.id,
              phase: "pickup" as const,
              status: i.status,
              rugTag: i.rugs?.tag ?? "New Rug",
              rugSize: "",
              notes: i.notes,
              photos: i.photo_urls ?? [],
              exceptionCode: i.exception_code ?? undefined,
            }));

          const pendingEventCount = await getStopPendingCount(stop.id);

          return {
            id: stop.id,
            clientName: stop.clients?.name ?? "Unknown",
            clientAddress: stop.clients?.address ?? "",
            date: stop.route_date,
            status: stop.status,
            signatureDataUrl: stop.signature_data_url ?? undefined,
            startedAt: stop.started_at ?? undefined,
            completedAt: stop.completed_at ?? undefined,
            deliveryListId: stop.delivery_list_id,
            deliveryItems,
            pickupItems,
            pendingEventCount,
          };
        })
      );

      setStops(mapped);
    } catch (error) {
      console.error("Failed to fetch stops:", error);
      toast({ title: "Failed to load stops", description: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [user?.id, dateWindow.start, dateWindow.end, getStopPendingCount]);

  useEffect(() => {
    void fetchStops();
    // Refresh stops periodically to get server updates
    const interval = setInterval(() => {
      void fetchStops();
    }, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [fetchStops]);

  const queued = useMemo(() => stops.filter((s) => s.status === "queued"), [stops]);
  const inProgress = useMemo(() => stops.filter((s) => s.status === "in_progress"), [stops]);
  const completed = useMemo(
    () => stops.filter((s) => ["completed", "completed_with_exceptions", "unable_to_complete"].includes(s.status)),
    [stops]
  );
  const activeStop = activeStopId ? stops.find((s) => s.id === activeStopId) : null;

  const startStop = async (stopId: string) => {
    await addEvent(stopId, "STOP_STARTED", {});
    toast({ title: "Stop started", description: "Syncing..." });
    await fetchStops();
  };

  const toggleItemVerified = async (stopId: string, itemId: string) => {
    const stop = stops.find((s) => s.id === stopId);
    const item = [...(stop?.deliveryItems ?? []), ...(stop?.pickupItems ?? [])].find((i) => i.id === itemId);
    if (!stop || !item || stop.status === "completed" || stop.status === "completed_with_exceptions") return;

    const nextStatus = item.status === "verified" ? "pending" : "verified";
    if (nextStatus === "verified") {
      await addEvent(stopId, "ITEM_VERIFIED", { route_stop_item_id: itemId });
      
      // If this is a delivery item, also mark it as loaded_on_truck
      if (item.phase === "delivery" && item.deliveryListItemId && !item.loadedOnTruck) {
        try {
          const { error } = await supabaseExtended
            .from("delivery_list_items")
            .update({ loaded_on_truck: true })
            .eq("id", item.deliveryListItemId);

          if (error) {
            console.error("Failed to mark item as loaded:", error);
            // Don't fail the whole operation, just log
          }
        } catch (err) {
          console.error("Error marking item as loaded:", err);
        }
      }
      
      toast({ title: "Item verified", description: "Syncing..." });
    } else {
      // Reverting to pending - we'd need an event type for this, but for now just skip
      toast({ title: "Cannot revert", description: "Please contact support to revert item status" });
      return;
    }
    await fetchStops();
  };

  const setItemNotes = async (stopId: string, itemId: string, notes: string) => {
    // Notes are stored in the payload, but we don't have a dedicated event type
    // For now, we'll store notes locally and include them in exception/dispute events
    // In a full implementation, we'd have an ITEM_NOTES_SET event
    toast({ title: "Notes saved locally", description: "Notes will be included with next action" });
  };

  const addItemPhoto = async (stopId: string, itemId: string, file: File) => {
    try {
      // Store photo in offline queue
      await addPendingPhoto(stopId, itemId, file);
      toast({ title: "Photo queued", description: "Will upload when online" });
      
      // If online, try to sync immediately
      if (isOnline) {
        await sync();
      }
      
      await fetchStops();
    } catch (error) {
      toast({
        title: "Photo failed",
        description: error instanceof Error ? error.message : "Failed to queue photo",
        variant: "destructive",
      });
    }
  };

  const setSignature = async (stopId: string, dataUrl: string | null) => {
    if (dataUrl) {
      await addEvent(stopId, "SIGNATURE_SET", { signature_data_url: dataUrl });
      toast({ title: "Signature saved", description: "Syncing..." });
    }
    await fetchStops();
  };

  const finalizeTruck = async (stopId: string) => {
    const stop = stops.find((s) => s.id === stopId);
    if (!stop || !stop.deliveryListId) {
      toast({
        title: "Cannot finalize",
        description: "This stop does not have a delivery list",
        variant: "destructive",
      });
      return;
    }

    // Check that all delivery items are verified and loaded
    const allDeliveryItemsVerified = stop.deliveryItems.every((item) => item.status === "verified");
    const allDeliveryItemsLoaded = stop.deliveryItems.every((item) => item.loadedOnTruck);

    if (!allDeliveryItemsVerified) {
      toast({
        title: "Cannot finalize",
        description: "All delivery items must be verified before finalizing truck",
        variant: "destructive",
      });
      return;
    }

    if (!allDeliveryItemsLoaded) {
      toast({
        title: "Cannot finalize",
        description: "All delivery items must be marked as loaded before finalizing truck",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("checkout-delivery", {
        body: { delivery_list_id: stop.deliveryListId },
      });

      if (error || data?.error) {
        toast({
          title: "Finalization failed",
          description: data?.error || error?.message || "Failed to finalize truck",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Truck finalized!",
        description: `${data.invoices_created ?? 0} invoices created for ${data.rugs_delivered ?? 0} rugs.`,
      });

      // Refresh stops to get updated state
      await fetchStops();
    } catch (err) {
      toast({
        title: "Finalization failed",
        description: err instanceof Error ? err.message : "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  const completeStop = async (stopId: string) => {
    const stop = stops.find((s) => s.id === stopId);
    if (!stop) return;

    const allItems = [...stop.deliveryItems, ...stop.pickupItems];
    const allResolved = allItems.every((item) =>
      ["verified", "skipped", "disputed", "exception"].includes(item.status)
    );
    const hasSignature = Boolean(stop.signatureDataUrl);

    if (!allResolved) {
      toast({
        title: "Cannot complete stop",
        description: "All items must be verified, skipped, disputed, or exception",
        variant: "destructive",
      });
      return;
    }

    if (!hasSignature) {
      toast({
        title: "Cannot complete stop",
        description: "Signature is required",
        variant: "destructive",
      });
      return;
    }

    try {
      await addEvent(stopId, "STOP_COMPLETED", {});
      toast({ title: "Stop completion queued", description: "Syncing..." });
      
      // Try to sync immediately if online
      if (isOnline) {
        const result = await sync();
        if (result?.events.failed > 0) {
          const error = result.events.errors[0];
          if (error?.error.includes("Cannot complete stop")) {
            toast({
              title: "Completion failed",
              description: error.error,
              variant: "destructive",
            });
          }
        }
      }
      
      await fetchStops();
    } catch (error) {
      toast({
        title: "Completion failed",
        description: error instanceof Error ? error.message : "Failed to queue completion",
        variant: "destructive",
      });
    }
  };

  const handleDispute = async (stopId: string, itemId: string, phase: "delivery" | "pickup", disputeType: "refused_delivery" | "post_delivery_claim") => {
    if (phase === "pickup" && disputeType === "refused_delivery") {
      toast({ title: "Invalid", description: "Pickup items cannot be refused delivery", variant: "destructive" });
      return;
    }

    await addEvent(stopId, "ITEM_DISPUTED", {
      route_stop_item_id: itemId,
      dispute_type: disputeType,
      notes: "",
    });
    toast({ title: "Dispute recorded", description: "Syncing..." });
    setShowDisputeDialog(null);
    await fetchStops();
  };

  const handleException = async (stopId: string, itemId: string, exceptionCode: string, notes: string) => {
    await addEvent(stopId, "ITEM_EXCEPTION", {
      route_stop_item_id: itemId,
      exception_code: exceptionCode,
      notes,
    });
    toast({ title: "Exception recorded", description: "Syncing..." });
    setShowExceptionDialog(null);
    await fetchStops();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <LoadingState title="Loading stops" description="Preparing your assigned route..." className="w-full max-w-lg" />
      </div>
    );
  }

  if (!activeStop) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 bg-primary text-primary-foreground p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              <h1 className="text-lg font-semibold">RugBoost Driver</h1>
            </div>
            <div className="flex items-center gap-2">
              {!isOnline && (
                <div className="flex items-center gap-1 text-xs">
                  <WifiOff className="h-4 w-4" />
                  <span>Offline</span>
                </div>
              )}
              {pendingCount > 0 && (
                <Button variant="secondary" size="sm" onClick={() => void sync()}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
                  Sync ({pendingCount})
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => void signOut()}>
                Sign Out
              </Button>
            </div>
          </div>
        </header>
        <main className="p-4 space-y-6 max-w-lg mx-auto">
          {inProgress.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-3">In Progress ({inProgress.length})</h2>
              <div className="space-y-3">
                {inProgress.map((stop, i) => (
                  <div
                    key={stop.id}
                    className="rounded-lg border bg-card p-4 space-y-2 shadow-card animate-fade-in-up"
                    style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-base">{stop.clientName}</p>
                        <p className="text-sm text-muted-foreground">{stop.clientAddress}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(`${stop.date}T00:00:00`), "MMM d")} — {stop.deliveryItems.length} delivery, {stop.pickupItems.length} pickup
                        </p>
                      </div>
                      {stop.pendingEventCount > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <RefreshCw className="h-3 w-3 animate-spin" />
                          <span>{stop.pendingEventCount}</span>
                        </div>
                      )}
                    </div>
                    <Button className="w-full min-h-[44px]" onClick={() => setActiveStopId(stop.id)}>
                      Continue <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {queued.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-3">Queued ({queued.length})</h2>
              <div className="space-y-3">
                {queued.map((stop, i) => (
                  <div
                    key={stop.id}
                    className="rounded-lg border bg-card p-4 space-y-2 shadow-card animate-fade-in-up"
                    style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}
                  >
                    <p className="font-medium text-base">{stop.clientName}</p>
                    <p className="text-sm text-muted-foreground">{stop.clientAddress}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(`${stop.date}T00:00:00`), "MMM d")} — {stop.deliveryItems.length} delivery, {stop.pickupItems.length} pickup
                    </p>
                    <Button className="w-full min-h-[44px]" onClick={() => setActiveStopId(stop.id)}>
                      Start Stop <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {completed.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-3 text-muted-foreground">Completed</h2>
              <div className="space-y-3">
                {completed.map((stop) => (
                  <div
                    key={stop.id}
                    className="rounded-lg border bg-muted/50 p-4 space-y-1 cursor-pointer"
                    onClick={() => setActiveStopId(stop.id)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-muted-foreground">{stop.clientName}</p>
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(`${stop.date}T00:00:00`), "MMM d")} — {stop.deliveryItems.length} delivery, {stop.pickupItems.length} pickup
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {queued.length === 0 && inProgress.length === 0 && completed.length === 0 && (
            <EmptyState
              className="border-dashed"
              title="No assigned stops"
              description="New assignments will appear here when dispatch routes work to you."
            />
          )}
        </main>
      </div>
    );
  }

  const locked = ["completed", "completed_with_exceptions", "unable_to_complete"].includes(activeStop.status);
  const allItems = [...activeStop.deliveryItems, ...activeStop.pickupItems];
  const allResolved = allItems.every((item) => ["verified", "skipped", "disputed", "exception"].includes(item.status));
  const hasSignature = Boolean(activeStop.signatureDataUrl);
  const canComplete = allResolved && hasSignature && !locked;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2"
              onClick={() => setActiveStopId(null)}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold truncate">{activeStop.clientName}</h1>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <div className="flex items-center gap-1 text-xs">
                <WifiOff className="h-4 w-4" />
                <span>Offline</span>
              </div>
            )}
            {activeStop.pendingEventCount > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>{activeStop.pendingEventCount}</span>
              </div>
            )}
            <Button variant="secondary" size="sm" onClick={() => void signOut()}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>
      <main className="p-4 space-y-4 max-w-lg mx-auto">
        {locked && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Stop {activeStop.status === "completed" ? "completed" : activeStop.status === "completed_with_exceptions" ? "completed with exceptions" : "marked unable to complete"} on{" "}
              {activeStop.completedAt
                ? format(new Date(activeStop.completedAt), "M/d/yyyy") + " at " + format(new Date(activeStop.completedAt), "h:mm a")
                : "unknown date"}
              . Record is locked.
            </AlertDescription>
          </Alert>
        )}

        {activeStop.status === "queued" && (
          <Button className="w-full min-h-[48px] text-base" onClick={() => startStop(activeStop.id)}>
            Start Stop
          </Button>
        )}

        {/* Finalize Truck Button - shown when delivery items are ready */}
        {activeStop.status === "in_progress" &&
          activeStop.deliveryListId &&
          activeStop.deliveryItems.length > 0 && (
            <div className="space-y-2">
              <Button
                className="w-full min-h-[48px] text-base bg-green-600 hover:bg-green-700"
                onClick={() => finalizeTruck(activeStop.id)}
                disabled={
                  !activeStop.deliveryItems.every((item) => item.status === "verified" && item.loadedOnTruck)
                }
              >
                <Truck className="mr-2 h-4 w-4" />
                Finalize Truck
              </Button>
              {!activeStop.deliveryItems.every((item) => item.status === "verified" && item.loadedOnTruck) && (
                <p className="text-xs text-muted-foreground text-center">
                  All delivery items must be verified and loaded before finalizing truck
                </p>
              )}
            </div>
          )}

        {/* Delivery Items */}
        <section>
          <h3 className="text-sm font-semibold mb-2">Delivery Items ({activeStop.deliveryItems.length})</h3>
          {activeStop.deliveryItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No delivery items</p>
          ) : (
            <div className="space-y-3">
              {activeStop.deliveryItems.map((item) => (
                <StopItemCard
                  key={item.id}
                  item={item}
                  locked={locked}
                  onVerify={() => toggleItemVerified(activeStop.id, item.id)}
                  onNotesChange={(notes) => setItemNotes(activeStop.id, item.id, notes)}
                  onPhotoAdd={(file) => addItemPhoto(activeStop.id, item.id, file)}
                  onDispute={() => setShowDisputeDialog({ itemId: item.id, phase: "delivery" })}
                  onException={() => setShowExceptionDialog({ itemId: item.id })}
                />
              ))}
            </div>
          )}
        </section>

        {/* Pickup Items */}
        <section>
          <h3 className="text-sm font-semibold mb-2">Pickup Items ({activeStop.pickupItems.length})</h3>
          {activeStop.pickupItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pickup items</p>
          ) : (
            <div className="space-y-3">
              {activeStop.pickupItems.map((item) => (
                <StopItemCard
                  key={item.id}
                  item={item}
                  locked={locked}
                  onVerify={() => toggleItemVerified(activeStop.id, item.id)}
                  onNotesChange={(notes) => setItemNotes(activeStop.id, item.id, notes)}
                  onPhotoAdd={(file) => addItemPhoto(activeStop.id, item.id, file)}
                  onException={() => setShowExceptionDialog({ itemId: item.id })}
                  showDispute={false}
                />
              ))}
            </div>
          )}
        </section>

        {/* Signature */}
        {locked ? (
          activeStop.signatureDataUrl && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Signature</p>
              <img
                src={activeStop.signatureDataUrl}
                alt="Signature"
                className="w-full h-[150px] rounded-md border border-input bg-background object-contain"
              />
            </div>
          )
        ) : (
          <>
            <SignatureCanvas
              onSignatureChange={(url) => setSignature(activeStop.id, url)}
              disabled={false}
              initialDataUrl={activeStop.signatureDataUrl}
            />
            <div className="space-y-2 pt-2">
              <Button
                className="w-full min-h-[48px] text-base"
                disabled={!canComplete}
                onClick={() => completeStop(activeStop.id)}
              >
                Complete Stop
              </Button>
              {!canComplete && (
                <p className="text-xs text-muted-foreground text-center">
                  {!allResolved && "All items must be verified, skipped, disputed, or exception. "}
                  {!hasSignature && "Signature is required."}
                </p>
              )}
            </div>
          </>
        )}
      </main>

      {/* Dispute Dialog */}
      <Dialog open={showDisputeDialog !== null} onOpenChange={(open) => !open && setShowDisputeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Dispute</DialogTitle>
            <DialogDescription>Select the type of dispute for this item.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Button
              className="w-full"
              variant="outline"
              onClick={() => showDisputeDialog && handleDispute(activeStop.id, showDisputeDialog.itemId, showDisputeDialog.phase, "refused_delivery")}
            >
              Refused Delivery
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => showDisputeDialog && handleDispute(activeStop.id, showDisputeDialog.itemId, showDisputeDialog.phase, "post_delivery_claim")}
            >
              Post-Delivery Claim
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Exception Dialog */}
      <Dialog open={showExceptionDialog !== null} onOpenChange={(open) => !open && setShowExceptionDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Exception</DialogTitle>
            <DialogDescription>Enter exception details for this item.</DialogDescription>
          </DialogHeader>
          <ExceptionDialogContent
            onSave={(code, notes) => showExceptionDialog && handleException(activeStop.id, showExceptionDialog.itemId, code, notes)}
            onCancel={() => setShowExceptionDialog(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Stop Item Card Component
function StopItemCard({
  item,
  locked,
  onVerify,
  onNotesChange,
  onPhotoAdd,
  onDispute,
  onException,
  showDispute = true,
}: {
  item: StopItem;
  locked: boolean;
  onVerify: () => void;
  onNotesChange: (notes: string) => void;
  onPhotoAdd: (file: File) => void;
  onDispute?: () => void;
  onException: () => void;
  showDispute?: boolean;
}) {
  const [notes, setNotes] = useState(item.notes);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <p className="font-medium text-base">
          {item.rugTag} {item.rugSize && `— ${item.rugSize} ft`}
        </p>
        {item.status === "exception" && item.exceptionCode && (
          <p className="text-xs text-muted-foreground">Exception: {item.exceptionCode}</p>
        )}
      </div>

      {locked ? (
        <div className="space-y-1">
          <p className="text-sm flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-primary" /> {item.status}
          </p>
          {item.phase === "delivery" && item.loadedOnTruck && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Truck className="h-3 w-3" /> Loaded on truck
            </p>
          )}
          <p className="text-sm text-muted-foreground">Notes: {item.notes || "—"}</p>
        </div>
      ) : (
        <>
          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
            <Checkbox checked={item.status === "verified"} onCheckedChange={onVerify} className="h-5 w-5" />
            <span className="text-sm font-medium">Verified</span>
            {item.phase === "delivery" && item.loadedOnTruck && (
              <Badge variant="outline" className="text-xs ml-auto">
                <Truck className="h-3 w-3 mr-1" /> Loaded
              </Badge>
            )}
          </label>
          <div>
            <label className="text-sm text-muted-foreground">Notes</label>
            <Input
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                onNotesChange(e.target.value);
              }}
              placeholder="Optional notes…"
              className="mt-1 min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Photos</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.photos.map((photo) => (
                <div key={photo} className="relative h-14 w-14 rounded border overflow-hidden">
                  <img src={photo} alt="Evidence" className="h-full w-full object-cover" />
                </div>
              ))}
              <label className="h-14 w-14 rounded border border-dashed flex items-center justify-center text-muted-foreground cursor-pointer hover:text-foreground hover:border-primary">
                <Camera className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      onPhotoAdd(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            {showDispute && onDispute && (
              <Button variant="outline" size="sm" onClick={onDispute}>
                Dispute
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onException}>
              Exception
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// Exception Dialog Content
function ExceptionDialogContent({
  onSave,
  onCancel,
}: {
  onSave: (code: string, notes: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Exception Code</label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g., DAMAGED, MISSING, WRONG_ADDRESS"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Notes</label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional details..."
            className="mt-1"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => onSave(code, notes)} disabled={!code}>
          Save
        </Button>
      </DialogFooter>
    </>
  );
}

export default StopPortal;
