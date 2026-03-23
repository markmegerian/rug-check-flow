import { useState, useEffect, useMemo } from "react";
import { format, addDays } from "date-fns";
import { Package, CheckCircle2, ChevronRight, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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

/** Build upcoming route date options for the next 14 days. */
function buildRouteDateOptions(): Array<{ value: string; label: string; dayName: string }> {
  const options: Array<{ value: string; label: string; dayName: string }> = [];
  const today = new Date();
  for (let i = 0; i <= 13; i++) {
    const d = addDays(today, i);
    const dayIdx = d.getDay();
    const dayName = DAYS_OF_WEEK[dayIdx === 0 ? 6 : dayIdx - 1];
    const dateStr = format(d, "yyyy-MM-dd");
    const label = `${dayName} — ${format(d, "MMM d, yyyy")}${i === 0 ? " (Today)" : i === 1 ? " (Tomorrow)" : ""}`;
    options.push({ value: dateStr, label, dayName });
  }
  return options;
}

export function DeliveryPrepTab() {
  const { toast } = useToast();
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [allRugs, setAllRugs] = useState<RugInfo[]>([]);
  const [rugMap, setRugMap] = useState<Record<string, RugInfo>>({});
  const [clientMap, setClientMap] = useState<Record<string, ClientInfo>>({});
  const [, setDeliveryList] = useState<DeliveryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [previousStatusMap, setPreviousStatusMap] = useState<Record<string, string>>({});
  const [selectedRugId, setSelectedRugId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const routeDateOptions = useMemo(() => buildRouteDateOptions(), []);
  const defaultDate = useMemo(() => format(addDays(new Date(), 1), "yyyy-MM-dd"), []);
  const [selectedDate, setSelectedDate] = useState(defaultDate);

  const selectedOption = useMemo(
    () => routeDateOptions.find((o) => o.value === selectedDate),
    [routeDateOptions, selectedDate],
  );
  const selectedDayName = selectedOption?.dayName ?? "";

  // Fetch ALL undelivered rugs from wholesale clients (no date filter)
  const fetchAllRugs = async () => {
    setLoading(true);
    try {
      // 1. Fetch ALL clients (wholesale clients have route_day set)
      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("id, name, route_day, address");

      if (clientsError) {
        toast({ title: "Failed to load clients", description: clientsError.message, variant: "destructive" });
        return;
      }

      const clients = (clientsData ?? []) as ClientInfo[];
      const clientMapLocal: Record<string, ClientInfo> = {};
      clients.forEach((c) => { clientMapLocal[c.id] = c; });
      setClientMap(clientMapLocal);

      // 2. Fetch ALL undelivered rugs at any workflow stage
      const { data: rugsData, error: rugsError } = await supabase
        .from("rugs")
        .select("id, tag, description, status, size_length, size_width, client_id")
        .in("status", ["checked_in", "in_production", "ready"])
        .not("client_id", "is", null)
        .order("tag");

      if (rugsError) {
        toast({ title: "Failed to load rugs", description: rugsError.message, variant: "destructive" });
        return;
      }

      const eligibleRugs = (rugsData ?? []) as RugInfo[];
      setAllRugs(eligibleRugs);

      const rugMapLocal: Record<string, RugInfo> = {};
      eligibleRugs.forEach((r) => { rugMapLocal[r.id] = r; });
      setRugMap(rugMapLocal);
    } catch (error) {
      console.error("Failed to fetch delivery prep data:", error);
      toast({ title: "Failed to load data", description: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Fetch or create delivery list for the selected date, and sync items
  const fetchDeliveryListForDate = async (date: string, dayName: string) => {
    if (!dayName) return;

    // Find clients on this route day
    const clientIds = Object.values(clientMap)
      .filter((c) => c.route_day === dayName)
      .map((c) => c.id);

    if (clientIds.length === 0) {
      setDeliveryList(null);
      setItems([]);
      return;
    }

    // Get eligible rugs for these clients
    const eligibleRugs = allRugs.filter((r) => r.client_id && clientIds.includes(r.client_id));

    if (eligibleRugs.length === 0) {
      setDeliveryList(null);
      setItems([]);
      return;
    }

    // Find or create delivery list for this date
    const { data: listsData } = await supabase
      .from("delivery_lists")
      .select("id, route_day, target_date, status")
      .eq("target_date", date)
      .eq("route_day", dayName)
      .in("status", ["compiling", "confirmed"])
      .limit(1);

    let list: DeliveryList;

    if (listsData && listsData.length > 0) {
      list = listsData[0] as DeliveryList;
    } else {
      const { data: newList, error: createError } = await supabase
        .from("delivery_lists")
        .insert({ route_day: dayName, target_date: date })
        .select("id, route_day, target_date, status")
        .single();

      if (createError || !newList) {
        toast({ title: "Failed to create delivery list", description: createError?.message, variant: "destructive" });
        return;
      }
      list = newList as DeliveryList;
    }

    setDeliveryList(list);

    // Fetch existing items
    const { data: existingItems } = await supabase
      .from("delivery_list_items")
      .select("*")
      .eq("delivery_list_id", list.id);

    const existingRugIds = new Set((existingItems ?? []).map((i: DeliveryItem) => i.rug_id));

    // Add new eligible rugs
    const newRugs = eligibleRugs.filter((r) => !existingRugIds.has(r.id));
    if (newRugs.length > 0) {
      const itemsToInsert = newRugs.map((r) => ({
        delivery_list_id: list.id,
        rug_id: r.id,
        client_id: r.client_id,
      }));
      await supabase.from("delivery_list_items").upsert(itemsToInsert, { onConflict: "delivery_list_id,rug_id", ignoreDuplicates: true });
    }

    // Re-fetch all items for this list
    const { data: allItems } = await supabase
      .from("delivery_list_items")
      .select("*")
      .eq("delivery_list_id", list.id);

    const typedItems = (allItems ?? []) as DeliveryItem[];
    const eligibleRugIds = new Set(eligibleRugs.map((r) => r.id));
    setItems(typedItems.filter((i) => eligibleRugIds.has(i.rug_id)));
  };

  useEffect(() => {
    fetchAllRugs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When date changes or data loads, sync delivery list
  useEffect(() => {
    if (!loading && Object.keys(clientMap).length > 0) {
      fetchDeliveryListForDate(selectedDate, selectedDayName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, loading]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllRugs();
    setRefreshing(false);
    toast({ title: "List refreshed" });
  };

  // Filtered rugs for display: all rugs from clients on the selected route day
  const filteredRugs = useMemo(() => {
    if (!selectedDayName) return allRugs;
    const clientIds = new Set(
      Object.values(clientMap)
        .filter((c) => c.route_day === selectedDayName)
        .map((c) => c.id),
    );
    return allRugs.filter((r) => r.client_id && clientIds.has(r.client_id));
  }, [allRugs, clientMap, selectedDayName]);

  // Build a lookup from rug_id to delivery item
  const itemByRugId = useMemo(() => {
    const map: Record<string, DeliveryItem> = {};
    items.forEach((i) => { map[i.rug_id] = i; });
    return map;
  }, [items]);

  const toggleConfirmed = async (e: React.MouseEvent, itemId: string, value: boolean) => {
    e.stopPropagation();
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

  // Group rugs by client
  const rugsByClient = useMemo(() => {
    const map: Record<string, RugInfo[]> = {};
    filteredRugs.forEach((rug) => {
      const clientId = rug.client_id ?? "unknown";
      if (!map[clientId]) map[clientId] = [];
      map[clientId].push(rug);
    });
    return Object.entries(map).sort(([a], [b]) => {
      const nameA = clientMap[a]?.name ?? "";
      const nameB = clientMap[b]?.name ?? "";
      return nameA.localeCompare(nameB);
    });
  }, [filteredRugs, clientMap]);

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

  const totalItems = filteredRugs.length;
  const confirmedCount = filteredRugs.filter((r) => itemByRugId[r.id]?.confirmed_for_delivery).length;
  const readyCount = filteredRugs.filter((r) => r.status === "ready").length;
  const inProductionCount = filteredRugs.filter((r) => r.status === "in_production").length;
  const checkedInCount = filteredRugs.filter((r) => r.status === "checked_in").length;

  return (
    <div className="p-4 md:p-6 overflow-auto h-full animate-fade-in-up">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Delivery Prep</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {totalItems} rugs · {readyCount} ready · {inProductionCount} in production · {checkedInCount} checked in · {confirmedCount} confirmed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedDate} onValueChange={setSelectedDate}>
            <SelectTrigger className="w-[280px] h-9">
              <SelectValue placeholder="Select delivery date" />
            </SelectTrigger>
            <SelectContent>
              {routeDateOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {totalItems === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            No rugs to prep for {selectedDayName}'s delivery route ({format(new Date(selectedDate + "T00:00:00"), "MMM d, yyyy")}).
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {rugsByClient.map(([clientId, clientRugs]) => {
            const client = clientMap[clientId];
            const clientConfirmed = clientRugs.filter((r) => itemByRugId[r.id]?.confirmed_for_delivery).length;

            return (
              <div key={clientId} className="border border-border rounded-lg overflow-hidden bg-card">
                <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-foreground">{client?.name ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{client?.address || "No address"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{clientRugs.length} rugs</Badge>
                    {clientConfirmed > 0 && (
                      <Badge variant="default" className="text-xs bg-green-600">{clientConfirmed} confirmed</Badge>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-border">
                  {clientRugs.map((rug) => {
                    const item = itemByRugId[rug.id];
                    const isReady = rug.status === "ready";
                    const isConfirmed = item?.confirmed_for_delivery ?? false;

                    return (
                      <div
                        key={rug.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openRug(rug.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") openRug(rug.id); }}
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
                                  onCheckedChange={(v) => {
                                    if (!item) return;
                                    toggleConfirmed(
                                      { stopPropagation: () => {} } as React.MouseEvent,
                                      item.id,
                                      !!v,
                                    );
                                  }}
                                  disabled={!item || updating === item?.id}
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              {isConfirmed ? (
                                <p>Confirmed for delivery — click to unconfirm</p>
                              ) : !isReady ? (
                                <p>Rug is {statusLabel(rug.status)} — confirming will mark it Ready</p>
                              ) : (
                                <p>Click to confirm this rug for delivery</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-medium">{rug.tag}</span>
                            {rug.description && (
                              <span className="text-xs text-muted-foreground">{rug.description}</span>
                            )}
                            {rug.size_length && rug.size_width && (
                              <span className="text-xs text-muted-foreground">
                                {rug.size_length}×{rug.size_width} ft
                              </span>
                            )}
                          </div>
                        </div>

                        <RugStatusBadge status={rug.status} className="text-xs shrink-0" />

                        {isConfirmed && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        )}

                        {!isReady && !isConfirmed && (
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger>
                                {rug.status === "in_production" ? (
                                  <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-blue-500 shrink-0" />
                                )}
                              </TooltipTrigger>
                              <TooltipContent side="left">
                                <p>{statusLabel(rug.status)} — may not be ready by delivery date</p>
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
            fetchAllRugs();
          }
        }}
      />
    </div>
  );
}
