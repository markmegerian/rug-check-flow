import { useState, useEffect, useCallback, useMemo } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { format, addDays } from "date-fns";
import { Package, CheckCircle2, Calendar, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  const [updating, setUpdating] = useState<string | null>(null);

  // Tomorrow's date
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

  const fetchDeliveryPrepItems = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch delivery lists for tomorrow
      const { data: listsData, error: listsError } = await supabase
        .from("delivery_lists")
        .select("id, route_day, target_date, status")
        .eq("target_date", tomorrow)
        .in("status", ["compiling", "confirmed"]);

      if (listsError) {
        toast({ title: "Failed to load delivery lists", description: listsError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      const lists = (listsData ?? []) as DeliveryList[];
      const listMap: Record<string, DeliveryList> = {};
      lists.forEach((list) => {
        listMap[list.id] = list;
      });
      setDeliveryListMap(listMap);

      if (lists.length === 0) {
        setItems([]);
        setLoading(false);
        return;
      }

      const listIds = lists.map((l) => l.id);

      // Fetch delivery items for these lists
      const { data: itemsData, error: itemsError } = await supabase
        .from("delivery_list_items")
        .select("*")
        .in("delivery_list_id", listIds);

      if (itemsError) {
        toast({ title: "Failed to load items", description: itemsError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      const typedItems = (itemsData ?? []) as DeliveryItem[];
      
      // Filter to only items where rug status is 'ready'
      const rugIds = typedItems.map((i) => i.rug_id);
      if (rugIds.length > 0) {
        const { data: rugsData } = await supabase
          .from("rugs")
          .select("id, tag, status, size_length, size_width")
          .in("id", rugIds);

        const rugs = (rugsData ?? []) as RugInfo[];
        const rugMapLocal: Record<string, RugInfo> = {};
        rugs.forEach((r) => {
          rugMapLocal[r.id] = r;
        });
        setRugMap(rugMapLocal);

        // Filter items to only those with ready rugs
        const readyRugIds = new Set(rugs.filter((r) => r.status === "ready").map((r) => r.id));
        const readyItems = typedItems.filter((i) => readyRugIds.has(i.rug_id));
        setItems(readyItems);

        // Fetch client info
        const clientIds = [...new Set(readyItems.map((i) => i.client_id).filter(Boolean))] as string[];
        if (clientIds.length > 0) {
          const { data: clientsData } = await supabase
            .from("clients")
            .select("id, name, route_day, address")
            .in("id", clientIds);

          const clients = (clientsData ?? []) as ClientInfo[];
          const clientMapLocal: Record<string, ClientInfo> = {};
          clients.forEach((c) => {
            clientMapLocal[c.id] = c;
          });
          setClientMap(clientMapLocal);
        }
      } else {
        setItems([]);
      }
    } catch (error) {
      console.error("Failed to fetch delivery prep items:", error);
      toast({ title: "Failed to load items", description: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [tomorrow, toast]);

  useEffect(() => {
    void fetchDeliveryPrepItems();
  }, [fetchDeliveryPrepItems]);

  const toggleConfirmed = async (itemId: string, value: boolean) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    // Verify rug is ready
    const rug = rugMap[item.rug_id];
    if (value && rug && rug.status !== "ready") {
      toast({
        title: "Cannot confirm",
        description: "This rug is still in production. Only ready rugs can be confirmed for delivery.",
        variant: "destructive",
      });
      return;
    }

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

      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, confirmed_for_delivery: value } : i)));
      toast({
        title: value ? "Rug confirmed" : "Confirmation removed",
        description: value ? "Rug is confirmed for tomorrow's delivery" : "Rug confirmation removed",
      });
    } finally {
      setUpdating(null);
    }
  };

  const pagination = usePaginatedList(items, 50);

  const confirmAllReady = async () => {
    const unconfirmedReady = items.filter((i) => !i.confirmed_for_delivery && rugMap[i.rug_id]?.status === "ready");
    if (unconfirmedReady.length === 0) return;
    setUpdating("batch");
    const ids = unconfirmedReady.map((i) => i.id);
    const { error } = await supabase
      .from("delivery_list_items")
      .update({ confirmed_for_delivery: true })
      .in("id", ids);
    if (error) {
      toast({ title: "Batch confirm failed", description: error.message, variant: "destructive" });
    } else {
      setItems((prev) => prev.map((i) => ids.includes(i.id) ? { ...i, confirmed_for_delivery: true } : i));
      toast({ title: `${ids.length} rugs confirmed`, description: "All ready rugs confirmed for delivery." });
    }
    setUpdating(null);
  };

  // Group items by route_day and client
  const itemsByRouteAndClient = useMemo(() => {
    const map: Record<string, Record<string, DeliveryItem[]>> = {};
    pagination.items.forEach((item) => {
      const list = deliveryListMap[item.delivery_list_id];
      if (!list) return;
      const routeDay = list.route_day;
      const clientId = item.client_id ?? "unknown";
      if (!map[routeDay]) map[routeDay] = {};
      if (!map[routeDay][clientId]) map[routeDay][clientId] = [];
      map[routeDay][clientId].push(item);
    });
    return map;
  }, [pagination.items, deliveryListMap]);

  const clientName = (clientId: string | null) => {
    if (!clientId) return "Unknown";
    return clientMap[clientId]?.name ?? "Unknown";
  };

  const clientAddress = (clientId: string | null) => {
    if (!clientId) return "";
    return clientMap[clientId]?.address ?? "";
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

  return (
    <div className="p-4 md:p-6 overflow-auto h-full animate-fade-in-up">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Delivery Prep — {format(new Date(tomorrow + "T00:00:00"), "MMM d")}</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-sm text-muted-foreground">
              {confirmedCount}/{totalItems} confirmed
            </span>
            {totalItems > 0 && (
              <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${(confirmedCount / totalItems) * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
        {totalItems > 0 && confirmedCount < totalItems && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 h-8 text-xs"
            onClick={confirmAllReady}
            disabled={updating === "batch"}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Confirm All Ready
          </Button>
        )}
      </div>

      {totalItems === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">No ready rugs scheduled for tomorrow's delivery.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(itemsByRouteAndClient).map(([routeDay, clients]) => (
            <div key={routeDay} className="border border-border rounded-lg overflow-hidden bg-card">
              <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold text-sm text-foreground">{routeDay}</h3>
                  <Badge variant="secondary" className="text-xs">{Object.keys(clients).length} clients</Badge>
                </div>
              </div>

              <div className="divide-y divide-border">
                {Object.entries(clients).map(([clientId, clientItems]) => (
                  <div key={clientId} className="p-4 space-y-3">
                    <div>
                      <p className="font-medium text-sm text-foreground">{clientName(clientId)}</p>
                      <p className="text-xs text-muted-foreground">{clientAddress(clientId)}</p>
                    </div>

                    <div className="space-y-2">
                      {clientItems.map((item) => {
                        const rug = rugMap[item.rug_id];
                        const isReady = rug?.status === "ready";
                        const isConfirmed = item.confirmed_for_delivery;

                        return (
                          <div
                            key={item.id}
                            className={`flex items-center gap-3 p-2 rounded border ${
                              isConfirmed ? "bg-green-50/50 dark:bg-green-950/20 border-green-200 dark:border-green-900" : "bg-background"
                            }`}
                          >
                            <TooltipProvider delayDuration={300}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Checkbox
                                      checked={isConfirmed}
                                      onCheckedChange={(v) => toggleConfirmed(item.id, !!v)}
                                      disabled={!isReady || updating === item.id}
                                    />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  {!isReady ? (
                                    <p>Rug is still in production — cannot confirm yet</p>
                                  ) : isConfirmed ? (
                                    <p>Confirmed for delivery — click to unconfirm</p>
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
                                {isConfirmed && (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                                )}
                              </div>
                            </div>

                            {!isReady && (
                              <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent side="left">
                                    <p>Still in production — cannot be confirmed yet</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
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
