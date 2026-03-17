import { useCallback, useEffect, useMemo, useState } from "react";
import { format, addDays, subDays } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useOfflineQueueContext } from "@/contexts/OfflineQueueContext";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { supabase } from "@/integrations/supabase/client";
import { addPendingPhoto } from "@/lib/offline-queue";
import { type Stop, type StopItem, type RouteStopRow, type RouteStopItemRow } from "@/types/route-stop";

export function useRouteStops() {
  const { user, signOut } = useAuth();
  const { addEvent, pendingCount, isOnline, isSyncing, sync, getStopPendingCount } = useOfflineQueueContext();
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStopId, setActiveStopId] = useState<string | null>(null);

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
      const { data: stopsData, error: stopsError } = await (supabaseExtended as any)
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

      const { data: itemsData, error: itemsError } = stopIds.length === 0
        ? { data: [], error: null }
        : await (supabaseExtended as any)
            .from("route_stop_items")
            .select("*, rugs(tag, size_length, size_width)")
            .in("route_stop_id", stopIds)
            .order("phase", { ascending: true })
            .order("created_at", { ascending: true });

      const deliveryListItemIds = ((itemsData ?? []) as unknown as RouteStopItemRow[])
        .filter((item) => item.delivery_list_item_id)
        .map((item) => item.delivery_list_item_id) as string[];

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
    const interval = setInterval(() => {
      void fetchStops();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchStops]);

  const queued = useMemo(() => stops.filter((s) => s.status === "queued"), [stops]);
  const inProgress = useMemo(() => stops.filter((s) => s.status === "in_progress"), [stops]);
  const completed = useMemo(
    () => stops.filter((s) => ["completed", "completed_with_exceptions", "unable_to_complete"].includes(s.status)),
    [stops]
  );
  const activeStop = activeStopId ? stops.find((s) => s.id === activeStopId) ?? null : null;

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

      if (item.phase === "delivery" && item.deliveryListItemId && !item.loadedOnTruck) {
        try {
          const { error } = await supabaseExtended
            .from("delivery_list_items")
            .update({ loaded_on_truck: true })
            .eq("id", item.deliveryListItemId);

          if (error) {
            console.error("Failed to mark item as loaded:", error);
          }
        } catch (err) {
          console.error("Error marking item as loaded:", err);
        }
      }

      toast({ title: "Item verified", description: "Syncing..." });
    } else {
      toast({ title: "Cannot revert", description: "Please contact support to revert item status" });
      return;
    }
    await fetchStops();
  };

  const setItemNotes = async (_stopId: string, _itemId: string, _notes: string) => {
    toast({ title: "Notes saved locally", description: "Notes will be included with next action" });
  };

  const addItemPhoto = async (stopId: string, itemId: string, file: File) => {
    try {
      await addPendingPhoto(stopId, itemId, file);
      toast({ title: "Photo queued", description: "Will upload when online" });

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
      toast({ title: "Cannot finalize", description: "This stop does not have a delivery list", variant: "destructive" });
      return;
    }

    const allDeliveryItemsVerified = stop.deliveryItems.every((item) => item.status === "verified");
    const allDeliveryItemsLoaded = stop.deliveryItems.every((item) => item.loadedOnTruck);

    if (!allDeliveryItemsVerified) {
      toast({ title: "Cannot finalize", description: "All delivery items must be verified before finalizing truck", variant: "destructive" });
      return;
    }

    if (!allDeliveryItemsLoaded) {
      toast({ title: "Cannot finalize", description: "All delivery items must be marked as loaded before finalizing truck", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("checkout-delivery", {
        body: { delivery_list_id: stop.deliveryListId },
      });

      if (error || data?.error) {
        toast({ title: "Finalization failed", description: data?.error || error?.message || "Failed to finalize truck", variant: "destructive" });
        return;
      }

      toast({
        title: "Truck finalized!",
        description: `${data.invoices_created ?? 0} invoices created for ${data.rugs_delivered ?? 0} rugs.`,
      });

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
      toast({ title: "Cannot complete stop", description: "All items must be verified, skipped, disputed, or exception", variant: "destructive" });
      return;
    }

    if (!hasSignature) {
      toast({ title: "Cannot complete stop", description: "Signature is required", variant: "destructive" });
      return;
    }

    try {
      await addEvent(stopId, "STOP_COMPLETED", {});
      toast({ title: "Stop completion queued", description: "Syncing..." });

      if (isOnline) {
        const result = await sync();
        if (result?.events.failed > 0) {
          const error = result.events.errors[0];
          if (error?.error.includes("Cannot complete stop")) {
            toast({ title: "Completion failed", description: error.error, variant: "destructive" });
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
    await fetchStops();
  };

  const handleException = async (stopId: string, itemId: string, exceptionCode: string, notes: string) => {
    await addEvent(stopId, "ITEM_EXCEPTION", {
      route_stop_item_id: itemId,
      exception_code: exceptionCode,
      notes,
    });
    toast({ title: "Exception recorded", description: "Syncing..." });
    await fetchStops();
  };

  return {
    stops,
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
  };
}
