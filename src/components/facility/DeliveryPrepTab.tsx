import { useState, useEffect, useCallback, useMemo } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { format, addDays, subDays } from "date-fns";
import { Package, CheckCircle2, Calendar, AlertCircle, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { RugStatusBadge } from "@/components/shared/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DAYS_OF_WEEK, DAY_INDEX } from "@/lib/constants";

type DeliveryItem = {
  id: string;
  delivery_list_id: string;
  rug_id: string;
  client_id: string | null;
  confirmed_for_delivery: boolean;
  loaded_on_truck: boolean;
};

type DeliveryList = {
  id: string;
  route_day: string;
  target_date: string;
  status: "compiling" | "confirmed" | "checked_out";
};

type RugInfo = {
  id: string;
  tag: string;
  status: string;
  size_length: number | null;
  size_width: number | null;
  checked_in_at: string;
  client_id: string | null;
};

type ClientInfo = {
  id: string;
  name: string;
  route_day: string;
  address: string;
};

export function DeliveryPrepTab() {
  const { toast } = useToast();
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [rugMap, setRugMap] = useState<Record<string, RugInfo>>({});
  const [clientMap, setClientMap] = useState<Record<string, ClientInfo>>({});
  const [deliveryListMap, setDeliveryListMap] = useState<Record<string, DeliveryList>>({});
  const [loading, setLoading] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  // Tracks previous rug status before confirming, so we can revert on uncheck
  const [previousStatusMap, setPreviousStatusMap] = useState<Record<string, string>>({});

  // Tomorrow's date and weekday — memoized to prevent infinite re-render loop
  const tomorrow = useMemo(() => format(addDays(new Date(), 1), "yyyy-MM-dd"), []);
  const tomorrowDayName = useMemo(() => {
    const d = addDays(new Date(), 1);
    return DAYS_OF_WEEK[d.getDay() === 0 ? 6 : d.getDay() - 1];
  }, []);

  // Cutoff: rugs must have been at facility for 1+ day — memoized to stable string
  const oneDayAgo = useMemo(() => subDays(new Date(), 1).toISOString(), []);

  const fetchDeliveryPrepItems = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch all clients on tomorrow's route day
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("id, name, route_day, address")
        .eq("route_day", tomorrowDayName);

      if (clientsError) {
        toast({ title: "Failed to load clients", description: clientsError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      const clients = (clientsData ?? []) as ClientInfo[];
      if (clients.length === 0) {
        setItems([]);
        setClientMap({});
        setDeliveryListMap({});
        setRugMap({});
        setLoading(false);
        return;
      }

      const clientMapLocal: Record<string, ClientInfo> = {};
      clients.forEach((c) => { clientMapLocal[c.id] = c; });
      setClientMap(clientMapLocal);

      const clientIds = clients.map((c) => c.id);

      // 2. Fetch ALL rugs for these clients that are NOT delivered (picked_up)
      //    and have been at the facility for 1+ day
      const { data: rugsData, error: rugsError } = await supabase
        .from("rugs")
        .select("id, tag, status, size_length, size_width, checked_in_at, client_id")
        .in("client_id", clientIds)
        .in("status", ["checked_in", "in_production", "ready"])
        .lte("checked_in_at", oneDayAgo);

      if (rugsError) {
        toast({ title: "Failed to load rugs", description: rugsError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      const eligibleRugs = (rugsData ?? []) as RugInfo[];
      const rugMapLocal: Record<string, RugInfo> = {};
      eligibleRugs.forEach((r) => { rugMapLocal[r.id] = r; });
      setRugMap(rugMapLocal);

      if (eligibleRugs.length === 0) {
        setItems([]);
        setDeliveryListMap({});
        setLoading(false);
        return;
      }

      // 3. Find or create delivery list for tomorrow
      let { data: listsData } = await supabase
        .from("delivery_lists")
        .select("id, route_day, target_date, status")
        .eq("target_date", tomorrow)
        .eq("route_day", tomorrowDayName)
        .in("status", ["compiling", "confirmed"])
        .limit(1);

      let deliveryList: DeliveryList;

      if (listsData && listsData.length > 0) {
        deliveryList = listsData[0] as DeliveryList;
      } else {
        // Auto-create a delivery list for tomorrow
        const { data: newList, error: createError } = await supabase
          .from("delivery_lists")
          .insert({ route_day: tomorrowDayName, target_date: tomorrow })
          .select("id, route_day, target_date, status")
          .single();

        if (createError || !newList) {
          toast({ title: "Failed to create delivery list", description: createError?.message, variant: "destructive" });
          setLoading(false);
          return;
        }
        deliveryList = newList as DeliveryList;
      }

      setDeliveryListMap({ [deliveryList.id]: deliveryList });

      // 4. Fetch existing delivery list items
      const { data: existingItems } = await supabase
        .from("delivery_list_items")
        .select("*")
        .eq("delivery_list_id", deliveryList.id);

      const existingRugIds = new Set((existingItems ?? []).map((i: DeliveryItem) => i.rug_id));

      // 5. Add any new eligible rugs not already on the list
      const newRugs = eligibleRugs.filter((r) => !existingRugIds.has(r.id));
      if (newRugs.length > 0) {
        const itemsToInsert = newRugs.map((r) => ({
          delivery_list_id: deliveryList.id,
          rug_id: r.id,
          client_id: r.client_id,
        }));
        await supabase.from("delivery_list_items").insert(itemsToInsert);
      }

      // 6. Re-fetch all items for this list
      const { data: allItems } = await supabase
        .from("delivery_list_items")
        .select("*")
        .eq("delivery_list_id", deliveryList.id);

      const typedItems = (allItems ?? []) as DeliveryItem[];

      // Filter to only items whose rugs are still eligible (not delivered, still at facility)
      const eligibleRugIds = new Set(eligibleRugs.map((r) => r.id));
      const filteredItems = typedItems.filter((i) => eligibleRugIds.has(i.rug_id));
      setItems(filteredItems);
    } catch (error) {
      console.error("Failed to fetch delivery prep items:", error);
      toast({ title: "Failed to load items", description: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tomorrow, tomorrowDayName, oneDayAgo, toast]);

  useEffect(() => {
    void fetchDeliveryPrepItems();
  }, [fetchDeliveryPrepItems]);

  const handleRefresh = async () => {
    setCompiling(true);
    await fetchDeliveryPrepItems();
    setCompiling(false);
    toast({ title: "List refreshed", description: "Delivery prep list has been updated with latest rugs." });
  };

  const toggleConfirmed = async (itemId: string, value: boolean) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const rug = rugMap[item.rug_id];
    if (!rug) return;

    setUpdating(itemId);
    try {
      // Update the delivery list item confirmation
      const { error } = await supabase
        .from("delivery_list_items")
        .update({ confirmed_for_delivery: value })
        .eq("id", itemId);

      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        return;
      }

      if (value && rug.status !== "ready") {
        // Confirming a non-ready rug: save previous status, then advance to "ready"
        setPreviousStatusMap((prev) => ({ ...prev, [rug.id]: rug.status }));

        const { error: rugError } = await supabase
          .from("rugs")
          .update({ status: "ready", completed_at: new Date().toISOString() })
          .eq("id", rug.id);

        if (rugError) {
          // Revert the confirmation if rug update fails
          await supabase
            .from("delivery_list_items")
            .update({ confirmed_for_delivery: false })
            .eq("id", itemId);
          toast({ title: "Failed to update rug status", description: rugError.message, variant: "destructive" });
          return;
        }

        setRugMap((prev) => ({ ...prev, [rug.id]: { ...rug, status: "ready" } }));
        toast({
          title: "Rug confirmed & marked ready",
          description: `${rug.tag} moved from ${statusLabel(rug.status)} to Ready`,
        });
      } else if (!value && previousStatusMap[rug.id]) {
        // Unchecking: revert rug to its previous status
        const prevStatus = previousStatusMap[rug.id];
        const revertUpdates: Record<string, string | null> = { status: prevStatus };
        // Clear completed_at if reverting away from "ready"
        if (prevStatus !== "ready") {
          revertUpdates.completed_at = null;
        }

        const { error: rugError } = await supabase
          .from("rugs")
          .update(revertUpdates)
          .eq("id", rug.id);

        if (rugError) {
          toast({ title: "Failed to revert rug status", description: rugError.message, variant: "destructive" });
          return;
        }

        setRugMap((prev) => ({ ...prev, [rug.id]: { ...rug, status: prevStatus } }));
        setPreviousStatusMap((prev) => {
          const next = { ...prev };
          delete next[rug.id];
          return next;
        });
        toast({
          title: "Confirmation removed & status reverted",
          description: `${rug.tag} reverted to ${statusLabel(prevStatus)}`,
        });
      } else {
        // Normal toggle (rug was already "ready", or no previous status to revert)
        toast({
          title: value ? "Rug confirmed" : "Confirmation removed",
          description: value ? "Rug is confirmed for tomorrow's delivery" : "Rug confirmation removed",
        });
      }

      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, confirmed_for_delivery: value } : i)));
    } finally {
      setUpdating(null);
    }
  };

  const pagination = usePaginatedList(items);

  // Group items by client
  const itemsByClient = useMemo(() => {
    const map: Record<string, DeliveryItem[]> = {};
    pagination.items.forEach((item) => {
      const clientId = item.client_id ?? "unknown";
      if (!map[clientId]) map[clientId] = [];
      map[clientId].push(item);
    });
    return map;
  }, [pagination.items]);

  const clientName = (clientId: string | null) => {
    if (!clientId) return "Unknown";
    return clientMap[clientId]?.name ?? "Unknown";
  };

  const clientAddress = (clientId: string | null) => {
    if (!clientId) return "";
    return clientMap[clientId]?.address ?? "";
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "ready": return "Ready";
      case "in_production": return "In Production";
      case "checked_in": return "Checked In";
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading delivery prep items…
      </div>
    );
  }

  const totalItems = items.length;
  const confirmedCount = items.filter((i) => i.confirmed_for_delivery).length;
  const readyCount = items.filter((i) => rugMap[i.rug_id]?.status === "ready").length;
  const inProductionCount = items.filter((i) => rugMap[i.rug_id]?.status === "in_production").length;
  const checkedInCount = items.filter((i) => rugMap[i.rug_id]?.status === "checked_in").length;

  return (
    <div className="p-4 md:p-6 overflow-auto h-full animate-fade-in-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Delivery Prep — {tomorrowDayName} ({format(new Date(tomorrow + "T00:00:00"), "MMM d, yyyy")})
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {totalItems} rugs total · {readyCount} ready · {inProductionCount} in production · {checkedInCount} checked in · {confirmedCount} confirmed
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleRefresh} disabled={compiling}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${compiling ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {totalItems === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">No rugs scheduled for {tomorrowDayName}'s delivery route.</p>
          <p className="text-xs text-muted-foreground mt-1">Rugs must be at the facility for at least 1 day to appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(itemsByClient).map(([clientId, clientItems]) => {
            const clientConfirmed = clientItems.filter((i) => i.confirmed_for_delivery).length;
            const clientReady = clientItems.filter((i) => rugMap[i.rug_id]?.status === "ready").length;

            return (
              <div key={clientId} className="border border-border rounded-lg overflow-hidden bg-card">
                <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-foreground">{clientName(clientId)}</p>
                    <p className="text-xs text-muted-foreground">{clientAddress(clientId)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{clientItems.length} rugs</Badge>
                    {clientConfirmed > 0 && (
                      <Badge variant="default" className="text-xs bg-green-600">{clientConfirmed} confirmed</Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-1 p-3">
                  {clientItems.map((item) => {
                    const rug = rugMap[item.rug_id];
                    const isReady = rug?.status === "ready";
                    const isConfirmed = item.confirmed_for_delivery;

                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 p-2 rounded border ${
                          isConfirmed
                            ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900"
                            : !isReady
                              ? "bg-amber-50/30 dark:bg-amber-950/10 border-amber-200/50 dark:border-amber-900/50"
                              : "bg-background"
                        }`}
                      >
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Checkbox
                                  checked={isConfirmed}
                                  onCheckedChange={(v) => toggleConfirmed(item.id, !!v)}
                                  disabled={updating === item.id}
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              {isConfirmed ? (
                                <p>Confirmed for delivery — click to unconfirm</p>
                              ) : !isReady ? (
                                <p>Rug is {statusLabel(rug?.status ?? "unknown")} — you can still confirm if it will be ready by tomorrow</p>
                              ) : (
                                <p>Click to confirm this rug is physically ready for delivery</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium">{rug?.tag ?? item.rug_id.slice(0, 8)}</span>
                            {rug?.size_length && rug?.size_width && (
                              <span className="text-xs text-muted-foreground">
                                {rug.size_length}×{rug.size_width} ft
                              </span>
                            )}
                            {rug && <RugStatusBadge status={rug.status} className="text-xs" />}
                            {isConfirmed && (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                            )}
                          </div>
                        </div>

                        {!isReady && (
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger>
                                {rug?.status === "in_production" ? (
                                  <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-blue-500 shrink-0" />
                                )}
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                <p>{statusLabel(rug?.status ?? "unknown")} — may not be ready by tomorrow</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            hasPrev={pagination.hasPrev}
            hasNext={pagination.hasNext}
            onPrev={pagination.prevPage}
            onNext={pagination.nextPage}
            label="items"
          />
        </div>
      )}
    </div>
  );
}
