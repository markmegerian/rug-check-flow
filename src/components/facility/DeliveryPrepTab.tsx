import { useState, useEffect, useMemo } from "react";
import { format, addDays } from "date-fns";
import { Package, CheckCircle2, ChevronRight, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { RugStatusBadge } from "@/components/shared/StatusBadge";
import { RugDetailSheet } from "@/components/facility/RugDetailSheet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DAYS_OF_WEEK } from "@/lib/constants";

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
  description: string;
  status: string;
  size_length: number | null;
  size_width: number | null;
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
  const [deliveryList, setDeliveryList] = useState<DeliveryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [previousStatusMap, setPreviousStatusMap] = useState<Record<string, string>>({});
  const [selectedRugId, setSelectedRugId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Tomorrow is the delivery day; today is the prep day
  const [tomorrow] = useState(() => format(addDays(new Date(), 1), "yyyy-MM-dd"));
  const [tomorrowDayName] = useState(() => {
    const d = addDays(new Date(), 1);
    return DAYS_OF_WEEK[d.getDay() === 0 ? 6 : d.getDay() - 1];
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch clients on tomorrow's route day
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("id, name, route_day, address")
        .eq("route_day", tomorrowDayName);

      if (clientsError) {
        toast({ title: "Failed to load clients", description: clientsError.message, variant: "destructive" });
        return;
      }

      const clients = (clientsData ?? []) as ClientInfo[];
      if (clients.length === 0) {
        setItems([]);
        setClientMap({});
        setDeliveryList(null);
        setRugMap({});
        setLoading(false);
        return;
      }

      const clientMapLocal: Record<string, ClientInfo> = {};
      clients.forEach((c) => { clientMapLocal[c.id] = c; });
      setClientMap(clientMapLocal);

      const clientIds = clients.map((c) => c.id);

      // 2. Fetch ALL undelivered rugs for these clients — no time filter
      const { data: rugsData, error: rugsError } = await supabase
        .from("rugs")
        .select("id, tag, description, status, size_length, size_width, client_id")
        .in("client_id", clientIds)
        .in("status", ["checked_in", "in_production", "ready"])
        .order("tag");

      if (rugsError) {
        toast({ title: "Failed to load rugs", description: rugsError.message, variant: "destructive" });
        return;
      }

      const eligibleRugs = (rugsData ?? []) as RugInfo[];
      const rugMapLocal: Record<string, RugInfo> = {};
      eligibleRugs.forEach((r) => { rugMapLocal[r.id] = r; });
      setRugMap(rugMapLocal);

      if (eligibleRugs.length === 0) {
        setItems([]);
        setDeliveryList(null);
        setLoading(false);
        return;
      }

      // 3. Find or create delivery list for tomorrow
      const { data: listsData } = await supabase
        .from("delivery_lists")
        .select("id, route_day, target_date, status")
        .eq("target_date", tomorrow)
        .eq("route_day", tomorrowDayName)
        .in("status", ["compiling", "confirmed"])
        .limit(1);

      let list: DeliveryList;

      if (listsData && listsData.length > 0) {
        list = listsData[0] as DeliveryList;
      } else {
        const { data: newList, error: createError } = await supabase
          .from("delivery_lists")
          .insert({ route_day: tomorrowDayName, target_date: tomorrow })
          .select("id, route_day, target_date, status")
          .single();

        if (createError || !newList) {
          toast({ title: "Failed to create delivery list", description: createError?.message, variant: "destructive" });
          return;
        }
        list = newList as DeliveryList;
      }

      setDeliveryList(list);

      // 4. Fetch existing delivery list items
      const { data: existingItems } = await supabase
        .from("delivery_list_items")
        .select("*")
        .eq("delivery_list_id", list.id);

      const existingRugIds = new Set((existingItems ?? []).map((i: DeliveryItem) => i.rug_id));

      // 5. Add any new eligible rugs not already on the list
      const newRugs = eligibleRugs.filter((r) => !existingRugIds.has(r.id));
      if (newRugs.length > 0) {
        const itemsToInsert = newRugs.map((r) => ({
          delivery_list_id: list.id,
          rug_id: r.id,
          client_id: r.client_id,
        }));
        await supabase.from("delivery_list_items").upsert(itemsToInsert, { onConflict: "delivery_list_id,rug_id", ignoreDuplicates: true });
      }

      // 6. Re-fetch all items for this list
      const { data: allItems } = await supabase
        .from("delivery_list_items")
        .select("*")
        .eq("delivery_list_id", list.id);

      const typedItems = (allItems ?? []) as DeliveryItem[];

      // Only keep items whose rugs are still eligible
      const eligibleRugIds = new Set(eligibleRugs.map((r) => r.id));
      setItems(typedItems.filter((i) => eligibleRugIds.has(i.rug_id)));
    } catch (error) {
      console.error("Failed to fetch delivery prep items:", error);
      toast({ title: "Failed to load items", description: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast({ title: "List refreshed" });
  };

  const toggleConfirmed = async (e: React.MouseEvent, itemId: string, value: boolean) => {
    e.stopPropagation(); // Don't open the detail sheet
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const rug = rugMap[item.rug_id];
    if (!rug) return;

    setUpdating(itemId);
    try {
      const { error } = await supabase
        .from("delivery_list_items")
        .update({ confirmed_for_delivery: value })
        .eq("id", itemId);

      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        return;
      }

      if (value && rug.status !== "ready") {
        // Confirming a non-ready rug: save previous status, advance to ready
        setPreviousStatusMap((prev) => ({ ...prev, [rug.id]: rug.status }));

        const { error: rugError } = await supabase
          .from("rugs")
          .update({ status: "ready", completed_at: new Date().toISOString() })
          .eq("id", rug.id);

        if (rugError) {
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
        // Unchecking: revert to previous status
        const prevStatus = previousStatusMap[rug.id];
        const revertUpdates: Record<string, string | null> = { status: prevStatus };
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
          title: "Confirmation removed",
          description: `${rug.tag} reverted to ${statusLabel(prevStatus)}`,
        });
      } else {
        toast({
          title: value ? "Rug confirmed" : "Confirmation removed",
        });
      }

      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, confirmed_for_delivery: value } : i)));
    } finally {
      setUpdating(null);
    }
  };

  // Group items by client
  const itemsByClient = useMemo(() => {
    const map: Record<string, DeliveryItem[]> = {};
    items.forEach((item) => {
      const clientId = item.client_id ?? "unknown";
      if (!map[clientId]) map[clientId] = [];
      map[clientId].push(item);
    });
    // Sort by client name
    return Object.entries(map).sort(([a], [b]) => {
      const nameA = clientMap[a]?.name ?? "";
      const nameB = clientMap[b]?.name ?? "";
      return nameA.localeCompare(nameB);
    });
  }, [items, clientMap]);

  const statusLabel = (status: string) => {
    switch (status) {
      case "ready": return "Ready";
      case "in_production": return "In Production";
      case "checked_in": return "Checked In";
      default: return status;
    }
  };

  const openRug = (rugId: string) => {
    setSelectedRugId(rugId);
    setSheetOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading delivery prep…
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
            {totalItems} rugs · {readyCount} ready · {inProductionCount} in production · {checkedInCount} checked in · {confirmedCount} confirmed
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {totalItems === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">No rugs to prep for {tomorrowDayName}'s delivery route.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {itemsByClient.map(([clientId, clientItems]) => {
            const client = clientMap[clientId];
            const clientConfirmed = clientItems.filter((i) => i.confirmed_for_delivery).length;

            return (
              <div key={clientId} className="border border-border rounded-lg overflow-hidden bg-card">
                <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-foreground">{client?.name ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{client?.address || "No address"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{clientItems.length} rugs</Badge>
                    {clientConfirmed > 0 && (
                      <Badge variant="default" className="text-xs bg-green-600">{clientConfirmed} confirmed</Badge>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-border">
                  {clientItems.map((item) => {
                    const rug = rugMap[item.rug_id];
                    const isReady = rug?.status === "ready";
                    const isConfirmed = item.confirmed_for_delivery;

                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openRug(item.rug_id)}
                        onKeyDown={(e) => { if (e.key === "Enter") openRug(item.rug_id); }}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors ${
                          isConfirmed
                            ? "bg-green-50/50 dark:bg-green-950/20"
                            : !isReady
                              ? "bg-amber-50/30 dark:bg-amber-950/10"
                              : ""
                        }`}
                      >
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={isConfirmed}
                                  onCheckedChange={(v) => toggleConfirmed(
                                    // Create a synthetic event for stopPropagation
                                    { stopPropagation: () => {} } as React.MouseEvent,
                                    item.id,
                                    !!v,
                                  )}
                                  disabled={updating === item.id}
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              {isConfirmed ? (
                                <p>Confirmed for delivery — click to unconfirm</p>
                              ) : !isReady ? (
                                <p>Rug is {statusLabel(rug?.status ?? "unknown")} — confirming will mark it Ready</p>
                              ) : (
                                <p>Click to confirm this rug for tomorrow's delivery</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-medium">{rug?.tag ?? item.rug_id.slice(0, 8)}</span>
                            {rug?.description && (
                              <span className="text-xs text-muted-foreground">{rug.description}</span>
                            )}
                            {rug?.size_length && rug?.size_width && (
                              <span className="text-xs text-muted-foreground">
                                {rug.size_length}×{rug.size_width} ft
                              </span>
                            )}
                          </div>
                        </div>

                        <RugStatusBadge status={rug?.status ?? "checked_in"} className="text-xs shrink-0" />

                        {isConfirmed && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        )}

                        {!isReady && !isConfirmed && (
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

                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RugDetailSheet
        rugId={selectedRugId}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setSelectedRugId(null);
            fetchData();
          }
        }}
      />
    </div>
  );
}
