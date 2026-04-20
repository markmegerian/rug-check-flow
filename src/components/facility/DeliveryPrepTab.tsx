import { useState, useEffect, useMemo, useCallback } from "react";
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
import { fetchDeliveryPrepSnapshot, type DeliveryPrepSnapshotRow } from "@/lib/delivery-prep-snapshot";

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

function mapSnapshotToState(rows: DeliveryPrepSnapshotRow[]) {
  const first = rows[0] ?? null;
  const deliveryList = first ? {
    id: first.delivery_list_id,
    route_day: first.route_day,
    target_date: first.target_date,
    status: first.list_status,
  } satisfies DeliveryList : null;

  const rugMap = Object.fromEntries(rows.map((row) => [row.rug_id, {
    id: row.rug_id,
    tag: row.rug_tag,
    description: row.rug_description ?? "",
    status: row.rug_status,
    size_length: row.size_length,
    size_width: row.size_width,
    client_id: row.client_id,
  } satisfies RugInfo]));

  const clientMap = Object.fromEntries(
    rows.reduce<Array<[string, ClientInfo]>>((acc, row) => {
      if (acc.some(([clientId]) => clientId === row.client_id)) return acc;
      acc.push([row.client_id, {
        id: row.client_id,
        name: row.client_name,
        route_day: row.route_day,
        address: row.client_address ?? "",
      }]);
      return acc;
    }, []),
  );

  const items = rows.map((row) => ({
    id: `${row.delivery_list_id}:${row.rug_id}`,
    delivery_list_id: row.delivery_list_id,
    rug_id: row.rug_id,
    client_id: row.client_id,
    confirmed_for_delivery: row.confirmed_for_delivery,
    loaded_on_truck: row.loaded_on_truck,
  } satisfies DeliveryItem));

  return {
    deliveryList,
    items,
    allRugs: Object.values(rugMap),
    rugMap,
    clientMap,
  };
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

  const loadSnapshot = useCallback(async (date: string) => {
    setLoading(true);
    try {
      const rows = await fetchDeliveryPrepSnapshot(date);
      const next = mapSnapshotToState(rows);
      setDeliveryList(next.deliveryList);
      setItems(next.items);
      setAllRugs(next.allRugs);
      setRugMap(next.rugMap);
      setClientMap(next.clientMap);
    } catch (error) {
      console.error("Failed to fetch delivery prep data:", error);
      toast({ title: "Failed to load data", description: error instanceof Error ? error.message : "An unexpected error occurred", variant: "destructive" });
      setItems([]);
      setAllRugs([]);
      setRugMap({});
      setClientMap({});
      setDeliveryList(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadSnapshot(selectedDate);
  }, [selectedDate, loadSnapshot]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSnapshot(selectedDate);
    setRefreshing(false);
    toast({ title: "List refreshed" });
  };

  const filteredRugs = useMemo(() => {
    if (!selectedDayName) return allRugs;
    const clientIds = new Set(
      Object.values(clientMap)
        .filter((c) => c.route_day === selectedDayName)
        .map((c) => c.id),
    );
    return allRugs.filter((r) => r.client_id && clientIds.has(r.client_id));
  }, [allRugs, clientMap, selectedDayName]);

  const itemByRugId = useMemo(() => {
    const map: Record<string, DeliveryItem> = {};
    items.forEach((i) => { map[i.rug_id] = i; });
    return map;
  }, [items]);

  const toggleConfirmed = async (e: React.MouseEvent, rugId: string, value: boolean) => {
    e.stopPropagation();
    const item = items.find((i) => i.rug_id === rugId);
    if (!item) return;

    const rug = rugMap[item.rug_id];
    if (!rug) return;

    setUpdating(item.rug_id);
    try {
      const { error } = await supabase
        .from("delivery_list_items")
        .update({ confirmed_for_delivery: value })
        .eq("delivery_list_id", item.delivery_list_id)
        .eq("rug_id", item.rug_id);

      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        return;
      }

      if (value && rug.status !== "ready") {
        await supabase
          .from("delivery_list_items")
          .update({ confirmed_for_delivery: false })
          .eq("delivery_list_id", item.delivery_list_id)
          .eq("rug_id", item.rug_id);
        toast({
          title: "Rug not ready",
          description: `${rug.tag} is still ${statusLabel(rug.status)} and cannot join the guaranteed list yet.`,
          variant: "destructive",
        });
        return;
      }

      toast({ title: value ? "Rug confirmed" : "Confirmation removed" });
      setItems((prev) => prev.map((i) => (i.rug_id === item.rug_id ? { ...i, confirmed_for_delivery: value } : i)));
    } finally {
      setUpdating(null);
    }
  };

  const markRugReady = async (e: React.MouseEvent, rug: RugInfo) => {
    e.stopPropagation();
    if (rug.status === "ready") return;
    const confirmed = window.confirm(`Mark rug ${rug.tag} as ready for delivery?`);
    if (!confirmed) return;

    setUpdating(rug.id);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("rugs")
        .update({ status: "ready", completed_at: now })
        .eq("id", rug.id);

      if (error) {
        toast({ title: "Failed to mark ready", description: error.message, variant: "destructive" });
        return;
      }

      setAllRugs((prev) => prev.map((entry) => (entry.id === rug.id ? { ...entry, status: "ready" } : entry)));
      setRugMap((prev) => ({ ...prev, [rug.id]: { ...rug, status: "ready" } }));
      toast({ title: "Rug marked ready", description: `${rug.tag} is now ready for delivery prep.` });
    } finally {
      setUpdating(null);
    }
  };

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
            {totalItems} rugs · {readyCount} ready · {inProductionCount} in production · {checkedInCount} checked in · {confirmedCount} on guaranteed list
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
                                      item.rug_id,
                                      !!v,
                                    );
                                  }}
                                  disabled={!item || updating === item?.rug_id || !isReady}
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              {isConfirmed ? (
                                <p>Confirmed for delivery, click to unconfirm</p>
                              ) : !isReady ? (
                                <p>Use Mark Ready first, then confirm it for delivery</p>
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
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              disabled={updating === rug.id}
                              onClick={(e) => void markRugReady(e, rug)}
                            >
                              Mark Ready
                            </Button>
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
                                  <p>{statusLabel(rug.status)} , staff can mark it ready with confirmation when it is actually done</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </>
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
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
