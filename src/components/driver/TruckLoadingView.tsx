import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Package, Plus, Truck, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { DAYS_OF_WEEK } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingState, EmptyState } from "@/components/states/PageState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TruckLoadingViewProps {
  isOnline: boolean;
  onTruckFinalized: () => void;
}

interface RugOnTruck {
  deliveryListItemId: string | null; // null for morning additions not yet added
  rugId: string;
  rugTag: string;
  rugStatus: string;
  sizeLabel: string;
  clientId: string;
  clientName: string;
  clientAddress: string;
  confirmedForDelivery: boolean;
  loadedOnTruck: boolean;
  isMorningAddition: boolean;
}

interface ClientGroup {
  clientId: string;
  clientName: string;
  clientAddress: string;
  rugs: RugOnTruck[];
}

interface DeliveryListSummary {
  id: string;
  routeDay: string;
  targetDate: string;
  status: string;
  confirmedAt: string | null;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTodayRouteDay(): string {
  const jsDay = new Date().getDay(); // 0=Sun
  // DAYS_OF_WEEK is Mon-Sun, so index = (jsDay + 6) % 7
  return DAYS_OF_WEEK[(jsDay + 6) % 7];
}

function sizeLabel(width: number | null, length: number | null): string {
  if (width != null && length != null) return `${width}x${length}`;
  if (width != null) return `${width}w`;
  if (length != null) return `${length}l`;
  return "N/A";
}

function statusVariant(status: string): "default" | "secondary" | "outline" {
  switch (status) {
    case "ready":
      return "default";
    case "in_production":
      return "secondary";
    default:
      return "outline";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TruckLoadingView({ isOnline, onTruckFinalized }: TruckLoadingViewProps) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [invoiceCount, setInvoiceCount] = useState(0);

  const [deliveryListId, setDeliveryListId] = useState<string | null>(null);
  const [deliveryListSummary, setDeliveryListSummary] = useState<DeliveryListSummary | null>(null);
  const [matchingListCount, setMatchingListCount] = useState(0);
  const [rugs, setRugs] = useState<RugOnTruck[]>([]);

  // Track which rugs the driver has toggled as loaded (keyed by rugId)
  const [loadedSet, setLoadedSet] = useState<Set<string>>(new Set());
  // Track morning additions the driver has tapped "Add to truck"
  const [addedSet, setAddedSet] = useState<Set<string>>(new Set());

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const todayStr = format(new Date(), "yyyy-MM-dd");
      const routeDay = getTodayRouteDay();

      // 1. Fetch today's delivery lists for the route day and deterministically choose the active one
      const { data: lists, error: listErr } = await supabase
        .from("delivery_lists")
        .select("id, route_day, target_date, status, confirmed_at, updated_at")
        .eq("target_date", todayStr)
        .eq("route_day", routeDay)
        .in("status", ["compiling", "confirmed"]);

      if (listErr) throw listErr;

      const rankedLists = [...(lists ?? [])].sort((a, b) => {
        const rank = (status: string) => (status === "confirmed" ? 0 : 1);
        const rankDiff = rank(a.status) - rank(b.status);
        if (rankDiff !== 0) return rankDiff;
        const aStamp = Date.parse(a.confirmed_at ?? a.updated_at);
        const bStamp = Date.parse(b.confirmed_at ?? b.updated_at);
        return bStamp - aStamp;
      });

      if (rankedLists.length === 0) {
        setDeliveryListId(null);
        setDeliveryListSummary(null);
        setMatchingListCount(0);
        setRugs([]);
        setLoading(false);
        return;
      }

      const list = rankedLists[0];
      setDeliveryListId(list.id);
      setMatchingListCount(rankedLists.length);
      setDeliveryListSummary({
        id: list.id,
        routeDay: list.route_day,
        targetDate: list.target_date,
        status: list.status,
        confirmedAt: list.confirmed_at,
        updatedAt: list.updated_at,
      });

      // If already checked out, show submitted state
      if (list.status === "checked_out") {
        setSubmitted(true);
        setLoading(false);
        return;
      }

      // 2. Fetch delivery list items with confirmed_for_delivery
      const { data: items, error: itemsErr } = await supabase
        .from("delivery_list_items")
        .select("*")
        .eq("delivery_list_id", list.id)
        .eq("confirmed_for_delivery", true);

      if (itemsErr) throw itemsErr;

      const listItems = items ?? [];
      const rugIdsOnList = new Set(listItems.map((i) => i.rug_id));

      // Gather all rug ids to fetch
      const allRugIds = listItems.map((i) => i.rug_id);

      // 3. Fetch rug details + client details for list items
      let listRugs: RugOnTruck[] = [];
      if (allRugIds.length > 0) {
        const { data: rugRows, error: rugErr } = await supabase
          .from("rugs")
          .select("id, tag, status, size_width, size_length, client_id")
          .in("id", allRugIds);

        if (rugErr) throw rugErr;

        const clientIds = [
          ...new Set((rugRows ?? []).map((r) => r.client_id).filter(Boolean)),
        ] as string[];

        const clientMap: Record<string, { name: string; address: string }> = {};
        if (clientIds.length > 0) {
          const { data: clients } = await supabase
            .from("clients")
            .select("id, name, address")
            .in("id", clientIds);

          for (const c of clients ?? []) {
            clientMap[c.id] = { name: c.name, address: c.address };
          }
        }

        const itemByRug: Record<string, (typeof listItems)[number]> = {};
        for (const it of listItems) {
          itemByRug[it.rug_id] = it;
        }

        listRugs = (rugRows ?? []).map((r) => {
          const item = itemByRug[r.id];
          const client = r.client_id ? clientMap[r.client_id] : undefined;
          return {
            deliveryListItemId: item?.id ?? null,
            rugId: r.id,
            rugTag: r.tag,
            rugStatus: r.status,
            sizeLabel: sizeLabel(r.size_width, r.size_length),
            clientId: r.client_id ?? "",
            clientName: client?.name ?? "Unknown Client",
            clientAddress: client?.address ?? "",
            confirmedForDelivery: true,
            loadedOnTruck: item?.loaded_on_truck ?? false,
            isMorningAddition: false,
          };
        });
      }

      // 4. Fetch morning additions: rugs that are "ready" for clients on today's
      //    route day but NOT already on the delivery list
      const { data: morningRugs, error: morningErr } = await supabase
        .from("rugs")
        .select("id, tag, status, size_width, size_length, client_id, clients!inner(id, name, address, route_day)")
        .eq("status", "ready")
        .eq("clients.route_day", routeDay);

      if (morningErr) throw morningErr;

      const morningAdditions: RugOnTruck[] = (morningRugs ?? [])
        .filter((r) => !rugIdsOnList.has(r.id))
        .map((r) => {
          const client = r.clients as unknown as { id: string; name: string; address: string };
          return {
            deliveryListItemId: null,
            rugId: r.id,
            rugTag: r.tag,
            rugStatus: r.status,
            sizeLabel: sizeLabel(r.size_width, r.size_length),
            clientId: client?.id ?? "",
            clientName: client?.name ?? "Unknown Client",
            clientAddress: client?.address ?? "",
            confirmedForDelivery: false,
            loadedOnTruck: false,
            isMorningAddition: true,
          };
        });

      const allRugs = [...listRugs, ...morningAdditions];
      setRugs(allRugs);

      // Pre-populate loaded set with rugs already marked loaded in DB
      const preLoaded = new Set<string>();
      for (const r of allRugs) {
        if (r.loadedOnTruck) preLoaded.add(r.rugId);
      }
      setLoadedSet(preLoaded);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load delivery data";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  /** Rugs that are actionable (on the list or added by driver) */
  const activeRugs = useMemo(
    () => rugs.filter((r) => !r.isMorningAddition || addedSet.has(r.rugId)),
    [rugs, addedSet],
  );

  const morningAdditions = useMemo(
    () => rugs.filter((r) => r.isMorningAddition && !addedSet.has(r.rugId)),
    [rugs, addedSet],
  );

  const totalCount = activeRugs.length + morningAdditions.length;
  const loadedCount = activeRugs.filter((r) => loadedSet.has(r.rugId)).length;
  const allLoaded = activeRugs.length > 0 && loadedCount === activeRugs.length;

  /** Group active + morning-addition rugs by client */
  const clientGroups = useMemo(() => {
    const map = new Map<string, ClientGroup>();
    for (const r of rugs) {
      let group = map.get(r.clientId);
      if (!group) {
        group = {
          clientId: r.clientId,
          clientName: r.clientName,
          clientAddress: r.clientAddress,
          rugs: [],
        };
        map.set(r.clientId, group);
      }
      group.rugs.push(r);
    }
    return Array.from(map.values());
  }, [rugs]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const toggleLoaded = useCallback(
    async (rugId: string, deliveryListItemId: string | null) => {
      setLoadedSet((prev) => {
        const next = new Set(prev);
        if (next.has(rugId)) {
          next.delete(rugId);
        } else {
          next.add(rugId);
        }
        return next;
      });

      // Persist to DB
      if (deliveryListItemId) {
        const nowLoaded = !loadedSet.has(rugId);
        await supabase
          .from("delivery_list_items")
          .update({ loaded_on_truck: nowLoaded })
          .eq("id", deliveryListItemId);
      }
    },
    [loadedSet],
  );

  const addToTruck = useCallback(
    async (rug: RugOnTruck) => {
      if (!deliveryListId) return;

      try {
        const { data: inserted, error } = await supabase
          .from("delivery_list_items")
          .insert({
            delivery_list_id: deliveryListId,
            rug_id: rug.rugId,
            client_id: rug.clientId,
            confirmed_for_delivery: true,
            loaded_on_truck: false,
          })
          .select("id")
          .single();

        if (error) throw error;

        // Update local state: move from morning addition to active
        setRugs((prev) =>
          prev.map((r) =>
            r.rugId === rug.rugId
              ? {
                  ...r,
                  deliveryListItemId: inserted.id,
                  confirmedForDelivery: true,
                  isMorningAddition: false,
                }
              : r,
          ),
        );
        setAddedSet((prev) => new Set(prev).add(rug.rugId));

        toast({ title: "Added", description: `${rug.rugTag} added to truck` });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to add rug";
        toast({ title: "Error", description: message, variant: "destructive" });
      }
    },
    [deliveryListId, toast],
  );

  const handleSubmit = useCallback(async () => {
    if (!deliveryListId) return;
    setSubmitting(true);
    try {
      // 1. Mark all loaded rugs as confirmed_for_delivery + loaded_on_truck
      const loadedRugIds = Array.from(loadedSet);
      const loadedItems = rugs.filter((r) => loadedRugIds.includes(r.rugId) && r.deliveryListItemId);
      if (loadedItems.length > 0) {
        const itemIds = loadedItems.map((r) => r.deliveryListItemId).filter(Boolean) as string[];
        const { error: updateItemsErr } = await supabase
          .from("delivery_list_items")
          .update({ confirmed_for_delivery: true, loaded_on_truck: true })
          .in("id", itemIds);
        if (updateItemsErr) throw new Error(updateItemsErr.message);
      }

      // 2. Set delivery list status to "confirmed" (required by checkout-delivery)
      const { error: confirmErr } = await supabase
        .from("delivery_lists")
        .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
        .eq("id", deliveryListId);
      if (confirmErr) throw new Error(confirmErr.message);

      // 3. Call checkout-delivery edge function
      const { data, error } = await supabase.functions.invoke("checkout-delivery", {
        body: { delivery_list_id: deliveryListId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const count = (data as { invoices_created?: number })?.invoices_created ?? 0;
      setInvoiceCount(count);
      setSubmitted(true);

      toast({
        title: "Truck handed off",
        description: `${count} invoice${count === 1 ? "" : "s"} created. Stop proof happens on route. Drive safe!`,
      });

      onTruckFinalized();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit truck";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [deliveryListId, loadedSet, rugs, toast, onTruckFinalized]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        <LoadingState title="Loading truck" description="Fetching today's delivery list..." />
      </div>
    );
  }

  if (!deliveryListId) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        <EmptyState
          title="No delivery list for today"
          description="There is no delivery list scheduled for today. Check back later or contact the office."
          className="border-dashed"
        />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <div className="rounded-lg border bg-card p-8 text-center flex flex-col items-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
          <h2 className="text-xl font-semibold">Truck Handed Off</h2>
          <p className="text-sm text-muted-foreground">
            {invoiceCount > 0
              ? `${invoiceCount} invoice${invoiceCount === 1 ? "" : "s"} created.`
              : "All done for loading."}{" "}
            Stop proof continues on route. Drive safe!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-44">
      {/* ---- Header ---- */}
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground p-4">
        <div className="flex items-center justify-between gap-2 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            <h1 className="text-lg font-semibold">Truck Loading</h1>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <div className="flex items-center gap-1 text-xs">
                <WifiOff className="h-4 w-4" />
                <span>Offline</span>
              </div>
            )}
          </div>
        </div>
        <div className="max-w-lg mx-auto mt-1 flex items-center justify-between text-sm opacity-90">
          <span>{format(new Date(), "EEEE, MMMM d")}</span>
          <span>
            {totalCount} rug{totalCount === 1 ? "" : "s"} &middot; {activeRugs.length} confirmed
          </span>
        </div>
        {deliveryListSummary ? (
          <div className="max-w-lg mx-auto mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="secondary">{deliveryListSummary.routeDay}</Badge>
            <Badge variant="outline">List {deliveryListSummary.status}</Badge>
            {matchingListCount > 1 ? <Badge variant="outline">Using latest of {matchingListCount} lists</Badge> : null}
          </div>
        ) : null}
      </header>

      {/* ---- Main list grouped by client ---- */}
      <main className="p-4 space-y-4 max-w-lg mx-auto">
        {clientGroups.map((group) => (
          <section key={group.clientId} className="rounded-lg border bg-card shadow-card overflow-hidden">
            {/* Client header */}
            <div className="bg-muted/50 px-4 py-3 border-b">
              <p className="font-medium text-base">{group.clientName}</p>
              {group.clientAddress && (
                <p className="text-sm text-muted-foreground">{group.clientAddress}</p>
              )}
            </div>

            {/* Rug rows */}
            <div className="divide-y">
              {group.rugs.map((rug) => {
                const isAdded = addedSet.has(rug.rugId);
                const showAsActive = !rug.isMorningAddition || isAdded;
                const isLoaded = loadedSet.has(rug.rugId);

                return (
                  <div
                    key={rug.rugId}
                    className="flex items-center gap-3 px-4 py-3 min-h-[44px]"
                  >
                    {/* Checkbox or Add button */}
                    {showAsActive ? (
                      <Checkbox
                        checked={isLoaded}
                        onCheckedChange={() =>
                          toggleLoaded(rug.rugId, rug.deliveryListItemId)
                        }
                        className="h-6 w-6"
                      />
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-[36px] text-blue-600 border-blue-300 hover:bg-blue-50"
                        onClick={() => addToTruck(rug)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add to truck
                      </Button>
                    )}

                    {/* Rug info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate">{rug.rugTag}</span>
                        <span className="text-sm text-muted-foreground">{rug.sizeLabel}</span>
                      </div>
                    </div>

                    {/* Status badge */}
                    <Badge variant={statusVariant(rug.rugStatus)} className="shrink-0 capitalize">
                      {rug.rugStatus.replace("_", " ")}
                    </Badge>

                    {/* Morning addition indicator */}
                    {rug.isMorningAddition && !isAdded && (
                      <Badge
                        className="shrink-0 bg-blue-100 text-blue-800 border-blue-200"
                        variant="outline"
                      >
                        Morning
                      </Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {clientGroups.length === 0 && (
          <EmptyState
            title="No rugs on today's list"
            description="Guaranteed rugs and morning-ready additions will appear here."
            className="border-dashed"
          />
        )}
      </main>

      {/* ---- Bottom action bar ---- */}
      <div className="fixed bottom-14 inset-x-0 bg-background border-t p-4 z-10">
        <div className="max-w-lg mx-auto space-y-2">
          <p className="text-sm text-center text-muted-foreground">
            {loadedCount} of {activeRugs.length} loaded
          </p>
          <Button
            className="w-full min-h-[44px] bg-green-600 hover:bg-green-700 text-white"
            disabled={!allLoaded || submitting || activeRugs.length === 0}
            onClick={handleSubmit}
          >
            {submitting ? "Handing off..." : "Hand Off to Truck"}
          </Button>
        </div>
      </div>
    </div>
  );
}
