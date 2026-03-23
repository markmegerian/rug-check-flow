import { useEffect, useMemo, useState } from "react";
import { format, addDays, startOfWeek } from "date-fns";
import { Package, Truck, AlertCircle, MapPin, ArrowUpFromLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { cn } from "@/lib/utils";

type ReadyRug = {
  id: string;
  tag: string;
  clientName: string;
  clientId: string | null;
  routeDay: string | null;
  size: string;
};

type PickupInfo = {
  id: string;
  clientName: string;
  clientAddress: string;
  scheduledDate: string;
  routeDay: string | null;
  status: string;
  itemCount: number;
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function RouteBuilder() {
  const [readyRugs, setReadyRugs] = useState<ReadyRug[]>([]);
  const [pickups, setPickups] = useState<PickupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      // Fetch ready rugs (delivery anticipation)
      const { data: rugsData, error: rugsError } = await supabase
        .from("rugs")
        .select("id, tag, size_length, size_width, client_id, clients(name, route_day)")
        .eq("status", "ready")
        .order("checked_in_at", { ascending: true })
        .limit(200);

      if (rugsError) {
        setError(rugsError.message);
        setLoading(false);
        return;
      }

      type RugWithClient = {
        id: string;
        tag: string;
        size_length: number | null;
        size_width: number | null;
        client_id: string | null;
        clients: { name: string; route_day: string | null } | null;
      };

      const mapped = ((rugsData ?? []) as RugWithClient[]).map((rug) => ({
        id: rug.id,
        tag: rug.tag,
        clientName: rug.clients?.name ?? "Unknown",
        clientId: rug.client_id,
        routeDay: rug.clients?.route_day ?? null,
        size: `${rug.size_length ?? 0}' × ${rug.size_width ?? 0}'`,
      }));

      setReadyRugs(mapped);

      // Fetch upcoming pickup requests (pending, confirmed, assigned)
      const today = format(new Date(), "yyyy-MM-dd");
      const nextWeek = format(addDays(new Date(), 13), "yyyy-MM-dd");

      const { data: pickupData, error: pickupError } = await supabaseExtended
        .from("pickup_requests")
        .select("id, scheduled_date, route_day, status, clients(name, address)")
        .in("status", ["pending", "confirmed", "assigned"])
        .gte("scheduled_date", today)
        .lte("scheduled_date", nextWeek)
        .order("scheduled_date", { ascending: true });

      if (!pickupError && pickupData) {
        type PickupRow = {
          id: string;
          scheduled_date: string;
          route_day: string | null;
          status: string;
          clients: { name: string; address: string } | null;
        };

        // Fetch item counts
        const pickupIds = pickupData.map((p: PickupRow) => p.id);
        const itemCountMap: Record<string, number> = {};

        if (pickupIds.length > 0) {
          const { data: itemsData } = await supabaseExtended
            .from("pickup_request_items")
            .select("pickup_request_id")
            .in("pickup_request_id", pickupIds);

          if (itemsData) {
            itemsData.forEach((i: { pickup_request_id: string }) => {
              itemCountMap[i.pickup_request_id] = (itemCountMap[i.pickup_request_id] ?? 0) + 1;
            });
          }
        }

        setPickups(
          (pickupData as PickupRow[]).map((p) => ({
            id: p.id,
            clientName: p.clients?.name ?? "Unknown",
            clientAddress: p.clients?.address ?? "",
            scheduledDate: p.scheduled_date,
            routeDay: p.route_day,
            status: p.status,
            itemCount: itemCountMap[p.id] ?? 0,
          })),
        );
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  const schedule = useMemo(() => {
    return WEEKDAYS.map((day, idx) => {
      const date = format(addDays(weekStart, idx), "yyyy-MM-dd");
      const dayRugs = readyRugs.filter((r) => r.routeDay === day);
      const dayPickups = pickups.filter((p) => p.routeDay === day || p.scheduledDate === date);

      // Group rugs by client for delivery count
      const deliveryClients = new Set(dayRugs.map((r) => r.clientId).filter(Boolean));

      return { day, date, rugs: dayRugs, pickups: dayPickups, deliveryClientCount: deliveryClients.size };
    });
  }, [readyRugs, pickups, weekStart]);

  const unscheduled = useMemo(
    () => readyRugs.filter((r) => !r.routeDay || !WEEKDAYS.includes(r.routeDay as typeof WEEKDAYS[number])),
    [readyRugs],
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground p-4">Loading route data...</p>;
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 m-4">
        <p className="text-sm text-destructive">Failed to load route data: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Route Planner</h3>
          <p className="text-xs text-muted-foreground">
            Deliveries and pickups for the week of {format(weekStart, "MMM d")}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs gap-1">
            <Truck className="h-3 w-3" />
            {readyRugs.length} deliveries
          </Badge>
          <Badge variant="secondary" className="text-xs gap-1">
            <ArrowUpFromLine className="h-3 w-3" />
            {pickups.length} pickups
          </Badge>
          {unscheduled.length > 0 && (
            <Badge variant="destructive" className="text-xs gap-1">
              <AlertCircle className="h-3 w-3" />
              {unscheduled.length} unscheduled
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {/* Unscheduled column */}
        {unscheduled.length > 0 && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 min-h-[120px]">
            <div className="px-3 py-2 border-b border-destructive/20 rounded-t-lg">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-destructive">No route day set</span>
                <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                  {unscheduled.length}
                </Badge>
              </div>
              <p className="text-[10px] text-destructive/70 mt-0.5">
                Set a route day on the client record to schedule these.
              </p>
            </div>
            <div className="p-2 space-y-1.5">
              {unscheduled.map((rug) => (
                <RugItem key={rug.id} rug={rug} />
              ))}
            </div>
          </div>
        )}

        {/* Day columns */}
        {schedule.map((slot) => {
          const hasItems = slot.rugs.length > 0 || slot.pickups.length > 0;
          return (
            <div key={slot.day} className={cn("rounded-lg border min-h-[120px]", hasItems && "border-primary/20")}>
              <div className="px-3 py-2 border-b bg-card rounded-t-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold">{slot.day}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      {format(new Date(slot.date), "M/d")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {slot.rugs.length > 0 && (
                      <Badge variant="default" className="text-[10px] gap-0.5">
                        <Truck className="h-2.5 w-2.5" />{slot.rugs.length}
                      </Badge>
                    )}
                    {slot.pickups.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] gap-0.5">
                        <ArrowUpFromLine className="h-2.5 w-2.5" />{slot.pickups.length}
                      </Badge>
                    )}
                    {!hasItems && (
                      <Badge variant="outline" className="text-[10px]">0</Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-2 space-y-1.5">
                {!hasItems ? (
                  <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                    <Truck className="h-5 w-5 mb-1 opacity-30" />
                    <p className="text-[10px]">No stops</p>
                  </div>
                ) : (
                  <>
                    {/* Deliveries */}
                    {slot.rugs.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                          Deliveries ({slot.deliveryClientCount} location{slot.deliveryClientCount !== 1 ? "s" : ""})
                        </p>
                        {slot.rugs.map((rug) => <RugItem key={rug.id} rug={rug} />)}
                      </div>
                    )}

                    {/* Pickups */}
                    {slot.pickups.length > 0 && (
                      <div className="space-y-1">
                        {slot.rugs.length > 0 && <div className="border-t my-1.5" />}
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-1">
                          Pickups
                        </p>
                        {slot.pickups.map((pickup) => (
                          <PickupItem key={pickup.id} pickup={pickup} />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RugItem({ rug }: { rug: ReadyRug }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-sm">
      <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="font-mono text-xs font-medium">{rug.tag}</span>
        <span className="text-xs text-muted-foreground ml-2 truncate">{rug.clientName}</span>
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0">{rug.size}</span>
    </div>
  );
}

function PickupItem({ pickup }: { pickup: PickupInfo }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-sm border-blue-200/50 dark:border-blue-800/30">
      <MapPin className="h-3.5 w-3.5 text-blue-500 shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium">{pickup.clientName}</span>
        {pickup.clientAddress && (
          <p className="text-[10px] text-muted-foreground truncate">{pickup.clientAddress}</p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {pickup.itemCount > 0 && (
          <Badge variant="outline" className="text-[10px] h-4">{pickup.itemCount} rugs</Badge>
        )}
        <Badge
          variant={pickup.status === "assigned" ? "default" : "secondary"}
          className="text-[10px] h-4"
        >
          {pickup.status}
        </Badge>
      </div>
    </div>
  );
}
