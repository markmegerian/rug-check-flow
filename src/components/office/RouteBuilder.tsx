import { useEffect, useMemo, useState } from "react";
import { format, addDays, startOfWeek } from "date-fns";
import { Package, Truck, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type ReadyRug = {
  id: string;
  tag: string;
  clientName: string;
  clientId: string | null;
  routeDay: string | null;
  size: string;
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export function RouteBuilder() {
  const [readyRugs, setReadyRugs] = useState<ReadyRug[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);

  useEffect(() => {
    const fetchReadyRugs = async () => {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from("rugs")
        .select("id, tag, size_length, size_width, client_id, clients(name, route_day)")
        .eq("status", "ready")
        .order("checked_in_at", { ascending: true })
        .limit(200);

      if (fetchError) {
        setError(fetchError.message);
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

      const mapped = ((data ?? []) as RugWithClient[]).map((rug) => ({
        id: rug.id,
        tag: rug.tag,
        clientName: rug.clients?.name ?? "Unknown",
        clientId: rug.client_id,
        routeDay: rug.clients?.route_day ?? null,
        size: `${rug.size_length ?? 0}' × ${rug.size_width ?? 0}'`,
      }));

      setReadyRugs(mapped);
      setLoading(false);
    };

    fetchReadyRugs();
  }, []);

  const schedule = useMemo(() => {
    return WEEKDAYS.map((day, idx) => ({
      day,
      date: format(addDays(weekStart, idx), "yyyy-MM-dd"),
      rugs: readyRugs.filter((r) => r.routeDay === day),
    }));
  }, [readyRugs, weekStart]);

  const unscheduled = useMemo(
    () => readyRugs.filter((r) => !r.routeDay || !WEEKDAYS.includes(r.routeDay as typeof WEEKDAYS[number])),
    [readyRugs]
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground p-4">Loading ready rugs...</p>;
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/5 m-4">
        <p className="text-sm text-destructive">Failed to load rugs: {error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Route Planner</h3>
          <p className="text-xs text-muted-foreground">
            Rugs grouped by client route day. Week of {format(weekStart, "MMM d")}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {readyRugs.length} ready
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
        {schedule.map((slot) => (
          <div key={slot.day} className={cn("rounded-lg border min-h-[120px]", slot.rugs.length > 0 && "border-primary/20")}>
            <div className="px-3 py-2 border-b bg-card rounded-t-lg">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold">{slot.day}</span>
                  <span className="text-[10px] text-muted-foreground ml-1.5">
                    {format(new Date(slot.date), "M/d")}
                  </span>
                </div>
                <Badge
                  variant={slot.rugs.length > 0 ? "default" : "outline"}
                  className="text-[10px]"
                >
                  {slot.rugs.length}
                </Badge>
              </div>
            </div>
            <div className="p-2 space-y-1.5">
              {slot.rugs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                  <Truck className="h-5 w-5 mb-1 opacity-30" />
                  <p className="text-[10px]">No deliveries</p>
                </div>
              ) : (
                slot.rugs.map((rug) => <RugItem key={rug.id} rug={rug} />)
              )}
            </div>
          </div>
        ))}
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
