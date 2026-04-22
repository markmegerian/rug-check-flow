import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Truck, CheckCircle2, Package, Calendar, ChevronRight, AlertCircle, RefreshCw, History, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";

import { DAYS_OF_WEEK, DAY_INDEX } from "@/lib/constants";
import { DELIVERY_LIST_ELIGIBLE_RUG_STATUSES, shouldPromoteRugToReadyForDelivery } from "@/lib/delivery-lists";
import { fetchDeliveryRouteOverview } from "@/lib/delivery-route-overview";
import { DeliveryStatusBadge, RugStatusBadge } from "@/components/shared/StatusBadge";

type DeliveryList = {
  id: string;
  route_day: string;
  target_date: string;
  status: "compiling" | "confirmed" | "checked_out";
  confirmed_at: string | null;
  checked_out_at: string | null;
  created_at: string;
};

type DeliveryItem = {
  id: string;
  delivery_list_id: string;
  rug_id: string;
  client_id: string | null;
  confirmed_for_delivery: boolean;
  loaded_on_truck: boolean;
};

type RugInfo = {
  id: string;
  tag: string;
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

type InvoiceInfo = {
  id: string;
  invoice_number: string;
  delivery_list_id: string | null;
  client_id: string | null;
  total: number;
  status: string;
};

type ViewMode = "weekly" | "detail" | "history";

export function DeliveriesTab() {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [deliveryLists, setDeliveryLists] = useState<DeliveryList[]>([]);
  const [selectedList, setSelectedList] = useState<DeliveryList | null>(null);
  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [rugMap, setRugMap] = useState<Record<string, RugInfo>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [loading, setLoading] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [historyInvoices, setHistoryInvoices] = useState<Record<string, InvoiceInfo[]>>({});

  const routeOverviewQuery = useQuery({
    queryKey: ["delivery-route-overview"],
    queryFn: fetchDeliveryRouteOverview,
    staleTime: 30_000,
  });

  const fetchDeliveryLists = useCallback(async () => {
    const { data } = await supabase
      .from("delivery_lists")
      .select("id, route_day, target_date, status, confirmed_at, checked_out_at, created_at")
      .order("target_date", { ascending: false })
      .limit(50);
    setDeliveryLists((data ?? []) as DeliveryList[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (routeOverviewQuery.data) {
      const nextClients: ClientInfo[] = [];
      const seen = new Set<string>();
      for (const row of routeOverviewQuery.data) {
        if (seen.has(row.client_id)) continue;
        seen.add(row.client_id);
        nextClients.push({
          id: row.client_id,
          name: row.client_name,
          route_day: row.route_day,
          address: row.client_address,
        });
      }
      setClients(nextClients);
    }
  }, [routeOverviewQuery.data]);

  useEffect(() => {
    fetchDeliveryLists();
  }, [fetchDeliveryLists]);

  const clientsByDay = useMemo(() => {
    const map: Record<string, ClientInfo[]> = {};
    DAYS_OF_WEEK.forEach((d) => { map[d] = []; });
    clients.forEach((c) => {
      if (c.route_day && map[c.route_day]) {
        map[c.route_day].push(c);
      }
    });
    return map;
  }, [clients]);

  const clientMap = useMemo(() => {
    const map: Record<string, ClientInfo> = {};
    clients.forEach((client) => {
      map[client.id] = client;
    });
    return map;
  }, [clients]);

  const getNextTargetDate = (routeDay: string): string => {
    const dayIdx = DAY_INDEX[routeDay];
    if (dayIdx === undefined) return format(new Date(), "yyyy-MM-dd");
    const today = new Date();
    const todayDay = today.getDay();
    let diff = dayIdx - todayDay;
    if (diff <= 0) diff += 7;
    const target = addDays(today, diff);
    return format(target, "yyyy-MM-dd");
  };

  const compileDeliveryList = async (routeDay: string) => {
    setCompiling(true);
    const targetDate = getNextTargetDate(routeDay);
    const routeClients = clientsByDay[routeDay] ?? [];
    if (routeClients.length === 0) {
      toast({ title: "No clients on this route day", variant: "destructive" });
      setCompiling(false);
      return;
    }

    const clientIds = routeClients.map((c) => c.id);
    const { data: eligibleRugs, error: rugError } = await supabase
      .from("rugs")
      .select("id, tag, status, size_length, size_width, client_id")
      .in("client_id", clientIds)
      .in("status", [...DELIVERY_LIST_ELIGIBLE_RUG_STATUSES]);

    if (rugError) {
      toast({ title: "Failed to fetch rugs", description: rugError.message, variant: "destructive" });
      setCompiling(false);
      return;
    }

    if (!eligibleRugs || eligibleRugs.length === 0) {
      toast({ title: "No eligible rugs found", description: "No ready or in-production rugs for these clients." });
      setCompiling(false);
      return;
    }

    const { data: existing } = await supabase
      .from("delivery_lists")
      .select("id")
      .eq("route_day", routeDay)
      .eq("target_date", targetDate)
      .limit(1);

    let listId: string;

    if (existing && existing.length > 0) {
      listId = existing[0].id;
    } else {
      const { data: newList, error: listError } = await supabase
        .from("delivery_lists")
        .insert({ route_day: routeDay, target_date: targetDate })
        .select()
        .single();

      if (listError || !newList) {
        toast({ title: "Failed to create list", description: listError?.message, variant: "destructive" });
        setCompiling(false);
        return;
      }
      listId = newList.id;
    }

    // Fetch existing items to avoid duplicates
    const { data: existingItems } = await supabase
      .from("delivery_list_items")
      .select("rug_id")
      .eq("delivery_list_id", listId);

    const existingRugIds = new Set((existingItems ?? []).map((i) => i.rug_id));
    // Deduplicate eligible rugs by id and exclude already-listed ones
    const seen = new Set<string>();
    const newRugs = eligibleRugs.filter((r) => {
      if (seen.has(r.id) || existingRugIds.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    if (newRugs.length > 0) {
      const itemsToInsert = newRugs.map((r) => ({
        delivery_list_id: listId,
        rug_id: r.id,
        client_id: r.client_id,
      }));
      await supabase.from("delivery_list_items").upsert(itemsToInsert, { onConflict: "delivery_list_id,rug_id", ignoreDuplicates: true });
    }

    const totalAdded = newRugs.length;
    const totalExisting = existingRugIds.size;
    toast({
      title: existing && existing.length > 0 ? "List updated" : "Delivery list compiled",
      description: totalAdded > 0
        ? `${totalAdded} new rugs added (${totalExisting + totalAdded} total) for ${routeDay}`
        : `${totalExisting} rugs already on list for ${routeDay}`,
    });
    await fetchDeliveryLists();
    const { data: dl } = await supabase
      .from("delivery_lists")
      .select("id, route_day, target_date, status, confirmed_at, checked_out_at, created_at")
      .eq("id", listId)
      .single();
    if (dl) openDetail(dl as DeliveryList);
    setCompiling(false);
  };

  // Re-compile: add any new eligible rugs not already on the list
  const recompileDeliveryList = async () => {
    if (!selectedList || selectedList.status === "checked_out") return;
    setCompiling(true);

    const routeClients = clientsByDay[selectedList.route_day] ?? [];
    const clientIds = routeClients.map((c) => c.id);

    const { data: eligibleRugs } = await supabase
      .from("rugs")
      .select("id, tag, status, size_length, size_width, client_id")
      .in("client_id", clientIds)
      .in("status", [...DELIVERY_LIST_ELIGIBLE_RUG_STATUSES]);

    if (!eligibleRugs) {
      toast({ title: "No new rugs found" });
      setCompiling(false);
      return;
    }

    const existingRugIds = new Set(items.map((i) => i.rug_id));
    const newRugs = eligibleRugs.filter((r) => !existingRugIds.has(r.id));

    if (newRugs.length === 0) {
      toast({ title: "No new rugs", description: "All eligible rugs are already on the list." });
      setCompiling(false);
      return;
    }

    const itemsToInsert = newRugs.map((r) => ({
      delivery_list_id: selectedList.id,
      rug_id: r.id,
      client_id: r.client_id,
    }));

    await supabase.from("delivery_list_items").upsert(itemsToInsert, { onConflict: "delivery_list_id,rug_id", ignoreDuplicates: true });
    toast({ title: "List updated", description: `${newRugs.length} new rugs added.` });
    await openDetail(selectedList);
    setCompiling(false);
  };

  const openDetail = async (dl: DeliveryList) => {
    setSelectedList(dl);
    setViewMode("detail");
    setSelectedItemIds(new Set());

    const { data: listItems } = await supabase
      .from("delivery_list_items")
      .select("id, delivery_list_id, rug_id, client_id, confirmed_for_delivery, loaded_on_truck")
      .eq("delivery_list_id", dl.id);

    const typedItems = (listItems ?? []) as DeliveryItem[];
    setItems(typedItems);

    const rugIds = typedItems.map((i) => i.rug_id);
    if (rugIds.length > 0) {
      const { data: rugs } = await supabase
        .from("rugs")
        .select("id, tag, status, size_length, size_width, client_id")
        .in("id", rugIds);

      const map: Record<string, RugInfo> = {};
      (rugs ?? []).forEach((r) => { map[r.id] = r as RugInfo; });
      setRugMap(map);
    }
  };

  const toggleConfirmed = async (itemId: string, value: boolean) => {
    const item = items.find((i) => i.id === itemId);
    if (value && item) {
      const rug = rugMap[item.rug_id];
      if (rug && shouldPromoteRugToReadyForDelivery(rug.status)) {
        const { error: rugError } = await supabase
          .from("rugs")
          .update({ status: "ready" })
          .eq("id", rug.id);

        if (rugError) {
          toast({ title: "Failed to update rug status", description: rugError.message, variant: "destructive" });
          return;
        }

        setRugMap((prev) => ({
          ...prev,
          [rug.id]: { ...prev[rug.id], status: "ready" },
        }));
      }
    }
    await supabase
      .from("delivery_list_items")
      .update({ confirmed_for_delivery: value })
      .eq("id", itemId);
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, confirmed_for_delivery: value } : i));
  };

  const toggleLoaded = async (itemId: string, value: boolean) => {
    await supabase
      .from("delivery_list_items")
      .update({ loaded_on_truck: value })
      .eq("id", itemId);
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, loaded_on_truck: value } : i));
  };

  const removeItem = async (itemId: string) => {
    await supabase.from("delivery_list_items").delete().eq("id", itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    setSelectedItemIds((prev) => { const next = new Set(prev); next.delete(itemId); return next; });
    toast({ title: "Rug removed from list" });
  };

  const toggleSelectItem = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItemIds.size === items.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(items.map((i) => i.id)));
    }
  };

  const removeSelected = async () => {
    if (selectedItemIds.size === 0) return;
    const ids = Array.from(selectedItemIds);
    await supabase.from("delivery_list_items").delete().in("id", ids);
    setItems((prev) => prev.filter((i) => !selectedItemIds.has(i.id)));
    toast({ title: `${ids.length} rugs removed from list` });
    setSelectedItemIds(new Set());
  };

  const confirmList = async () => {
    if (!selectedList) return;
    const confirmedItems = items.filter((i) => i.confirmed_for_delivery);
    if (confirmedItems.length === 0) {
      toast({ title: "No rugs confirmed", description: "Confirm at least one rug for delivery.", variant: "destructive" });
      return;
    }

    await supabase
      .from("delivery_lists")
      .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
      .eq("id", selectedList.id);

    setSelectedList({ ...selectedList, status: "confirmed", confirmed_at: new Date().toISOString() });
    await fetchDeliveryLists();
    toast({ title: "Guaranteed list confirmed", description: `${confirmedItems.length} rugs are locked in for truck loading.` });
  };

  const checkoutTruck = async () => {
    if (!selectedList) return;
    const loadedItems = items.filter((i) => i.confirmed_for_delivery && i.loaded_on_truck);
    if (loadedItems.length === 0) {
      toast({ title: "No rugs loaded", description: "Mark rugs as loaded on truck first.", variant: "destructive" });
      return;
    }

    setCheckingOut(true);
    const { data, error } = await supabase.functions.invoke("checkout-delivery", {
      body: { delivery_list_id: selectedList.id },
    });

    setCheckingOut(false);
    if (error || data?.error) {
      toast({ title: "Checkout failed", description: data?.error || error?.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Truck handed off",
      description: `${data.invoices_created} invoices created for ${data.rugs_delivered} rugs. Stop signatures, photos, and proof happen on route.`,
    });
    setSelectedList({ ...selectedList, status: "checked_out", checked_out_at: new Date().toISOString() });
    await fetchDeliveryLists();
  };

  const clientName = (clientId: string | null) => {
    if (!clientId) return "Unknown";
    return clientMap[clientId]?.name ?? "Unknown";
  };

  const itemsByClient = useMemo(() => {
    const map: Record<string, DeliveryItem[]> = {};
    items.forEach((item) => {
      const key = item.client_id ?? "unknown";
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [items]);

  // Fetch invoices for checked-out lists in history view
  const openHistory = async () => {
    setViewMode("history");
    const checkedOutLists = deliveryLists.filter((dl) => dl.status === "checked_out");
    if (checkedOutLists.length === 0) return;

    // Fetch invoices with explicit delivery list linkage
    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_number, delivery_list_id, client_id, total, status")
      .order("created_at", { ascending: false })
      .limit(200);

    const invoiceMap: Record<string, InvoiceInfo[]> = {};
    if (invoices) {
      for (const dl of checkedOutLists) {
        invoiceMap[dl.id] = (invoices as unknown as InvoiceInfo[]).filter((inv) => inv.delivery_list_id === dl.id);
      }
    }
    setHistoryInvoices(invoiceMap);
  };


  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading deliveries…</div>;
  }

  // HISTORY VIEW
  if (viewMode === "history") {
    const checkedOutLists = deliveryLists.filter((dl) => dl.status === "checked_out");

    return (
      <div className="p-4 md:p-6 overflow-auto h-full animate-fade-in-up">
        <button
          onClick={() => setViewMode("weekly")}
          className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
        >
          ← Back to routes
        </button>

        <h2 className="text-lg font-semibold text-foreground mb-4">Delivery History</h2>

        {checkedOutLists.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed deliveries yet.</p>
        ) : (
          <div className="space-y-3">
            {checkedOutLists.map((dl) => {
              const invoices = historyInvoices[dl.id] ?? [];
              return (
                <div key={dl.id} className="border border-border rounded-lg bg-card overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm text-foreground">
                        {dl.route_day} — {format(new Date(dl.target_date + "T00:00:00"), "MMM d, yyyy")}
                      </p>
                      {dl.checked_out_at && (
                        <p className="text-xs text-muted-foreground">
                          Checked out {format(new Date(dl.checked_out_at), "MMM d, h:mm a")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <DeliveryStatusBadge status={dl.status} />
                      <Button size="sm" variant="ghost" onClick={() => openDetail(dl)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {invoices.length > 0 && (
                    <>
                      <Separator />
                      <div className="px-4 py-2 space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">Invoices generated</p>
                        {invoices.map((inv) => (
                          <div key={inv.id} className="flex items-center justify-between text-sm py-0.5">
                            <div className="flex items-center gap-2">
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="font-mono text-xs">{inv.invoice_number}</span>
                              <span className="text-muted-foreground text-xs">— {clientName(inv.client_id)}</span>
                            </div>
                            <span className="text-xs font-medium">${Number(inv.total).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // DETAIL VIEW
  if (viewMode === "detail" && selectedList) {
    const isCompiling = selectedList.status === "compiling";
    const isConfirmed = selectedList.status === "confirmed";
    const isCheckedOut = selectedList.status === "checked_out";
    const confirmedCount = items.filter((i) => i.confirmed_for_delivery).length;
    const loadedCount = items.filter((i) => i.confirmed_for_delivery && i.loaded_on_truck).length;

    return (
      <div className="p-4 md:p-6 overflow-auto h-full animate-fade-in-up">
        <button
          onClick={() => { setViewMode("weekly"); setSelectedList(null); }}
          className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
        >
          ← Back to routes
        </button>

        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              {selectedList.route_day} — {format(new Date(selectedList.target_date + "T00:00:00"), "MMM d, yyyy")}
              <DeliveryStatusBadge status={selectedList.status} />
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {items.length} rugs · {Object.keys(itemsByClient).length} clients
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Prep marks rugs ready, confirmation locks the guaranteed list, truck loading handles what gets loaded, and stop proof happens later on route.
            </p>
          </div>

          <div className="flex gap-2">
            {!isCheckedOut && (
              <Button size="sm" variant="outline" onClick={recompileDeliveryList} disabled={compiling}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Refresh ready rugs
              </Button>
            )}
            {isCompiling && (
              <Button onClick={confirmList} disabled={confirmedCount === 0}>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Confirm Guaranteed List ({confirmedCount})
              </Button>
            )}
            {isConfirmed && (
              <Button onClick={checkoutTruck} disabled={loadedCount === 0 || checkingOut}>
                <Truck className="h-4 w-4 mr-1" />
                {checkingOut ? "Processing…" : `Hand Off to Truck (${loadedCount})`}
              </Button>
            )}
          </div>
        </div>

        {isCompiling && items.length > 0 && (
          <div className="flex items-center gap-3 mb-4">
            <Checkbox
              checked={selectedItemIds.size === items.length && items.length > 0}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all"
            />
            <span className="text-sm text-muted-foreground">
              {selectedItemIds.size > 0 ? `${selectedItemIds.size} selected` : "Select all"}
            </span>
            {selectedItemIds.size > 0 && (
              <Button size="sm" variant="destructive" onClick={removeSelected}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Remove selected ({selectedItemIds.size})
              </Button>
            )}
          </div>
        )}

        <TooltipProvider delayDuration={300}>
        <div className="space-y-6">
          {Object.entries(itemsByClient).map(([cid, clientItems]) => (
            <div key={cid} className="border border-border rounded-lg overflow-hidden">
              <div className="bg-muted/50 px-4 py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-foreground">{clientName(cid)}</p>
                  <p className="text-xs text-muted-foreground">
                    {clientMap[cid]?.address || "No address"}
                  </p>
                </div>
                <Badge variant="secondary">{clientItems.length} rugs</Badge>
              </div>
              <div className="divide-y divide-border">
                {clientItems.map((item) => {
                  const rug = rugMap[item.rug_id];
                  const isInProduction = rug?.status === "in_production";
                  return (
                    <div key={item.id} className={`px-4 py-2.5 flex items-center gap-3 ${isInProduction && !isCheckedOut ? "bg-amber-50/50 dark:bg-amber-950/20" : ""} ${selectedItemIds.has(item.id) ? "bg-primary/5" : ""}`}>
                      {isCompiling && (
                        <Checkbox
                          checked={selectedItemIds.has(item.id)}
                          onCheckedChange={() => toggleSelectItem(item.id)}
                          aria-label="Select rug"
                        />
                      )}
                      {isCompiling && (
                        isInProduction ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span>
                                <Checkbox
                                  checked={item.confirmed_for_delivery}
                                  onCheckedChange={(v) => toggleConfirmed(item.id, !!v)}
                                  disabled
                                />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              <p>Cannot confirm yet, mark the rug ready first in delivery prep</p>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <Checkbox
                            checked={item.confirmed_for_delivery}
                            onCheckedChange={(v) => toggleConfirmed(item.id, !!v)}
                          />
                        )
                      )}
                      {isConfirmed && (
                        <Checkbox
                          checked={item.loaded_on_truck}
                          onCheckedChange={(v) => toggleLoaded(item.id, !!v)}
                          disabled={!item.confirmed_for_delivery}
                        />
                      )}
                      {isCheckedOut && (
                        <CheckCircle2 className={`h-4 w-4 ${item.loaded_on_truck ? "text-green-600" : "text-muted-foreground"}`} />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-sm font-medium">{rug?.tag ?? item.rug_id.slice(0, 8)}</span>
                        {rug?.size_length && rug?.size_width && (
                          <span className="text-xs text-muted-foreground ml-2">
                            {rug.size_length}×{rug.size_width} ft
                          </span>
                        )}
                      </div>
                      {rug && <RugStatusBadge status={rug.status} className="text-xs" />}
                      {isInProduction && !isCheckedOut && (
                        <Tooltip>
                          <TooltipTrigger>
                            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <p>Still in production, it must be marked ready before it can join the guaranteed list</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {isCompiling && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left"><p>Remove from list</p></TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        </TooltipProvider>
      </div>
    );
  }

  // WEEKLY ROUTE VIEW
  return (
    <div className="p-4 md:p-6 overflow-auto h-full animate-fade-in-up">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-foreground">Weekly Routes & Deliveries</h2>
        <Button size="sm" variant="outline" onClick={openHistory}>
          <History className="h-3.5 w-3.5 mr-1" />
          History
        </Button>
      </div>

      {/* Route days */}
      <div className="grid gap-4 lg:grid-cols-2">
        {DAYS_OF_WEEK.map((day) => {
          const dayClients = clientsByDay[day];
          const dayLists = deliveryLists.filter((dl) => dl.route_day === day);

          return (
            <div key={day} className="border border-border rounded-lg overflow-hidden bg-card shadow-sm">
              <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold text-sm text-foreground">{day}</h3>
                  <Badge variant="secondary" className="text-xs">{dayClients.length} clients</Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => compileDeliveryList(day)}
                  disabled={compiling || dayClients.length === 0}
                >
                  <Package className="h-3.5 w-3.5 mr-1" />
                  Build next-day list
                </Button>
              </div>

              {dayClients.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">No clients on this route.</p>
              ) : (
                <div className="divide-y divide-border">
                  {dayClients.map((c) => (
                    <div key={c.id} className="px-4 py-2 text-sm flex items-center justify-between">
                      <span className="text-foreground">{c.name}</span>
                      <span className="text-xs text-muted-foreground truncate ml-2 max-w-[200px]">{c.address || "—"}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recent lists for this day */}
              {dayLists.length > 0 && (
                <>
                  <Separator />
                  <div className="px-4 py-2 space-y-1">
                    <p className="text-xs text-muted-foreground font-medium mb-1">Recent lists</p>
                    {dayLists.slice(0, 3).map((dl) => (
                      <button
                        key={dl.id}
                        onClick={() => openDetail(dl)}
                        className="w-full flex items-center justify-between text-sm hover:bg-muted/50 rounded px-2 py-1.5 -mx-2 transition-colors"
                      >
                        <span className="text-foreground">
                          {format(new Date(dl.target_date + "T00:00:00"), "MMM d")}
                        </span>
                        <div className="flex items-center gap-2">
                          <DeliveryStatusBadge status={dl.status} />
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
