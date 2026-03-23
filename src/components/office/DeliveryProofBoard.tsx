import { useEffect, useState } from "react";
import { format, subDays } from "date-fns";
import { Camera, CheckCircle, AlertTriangle, ImageOff, Signature, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { cn } from "@/lib/utils";
import type { ExtendedTableRow } from "@/integrations/supabase/extended";

type ProofStop = {
  id: string;
  clientName: string;
  driverName: string;
  routeDate: string;
  status: string;
  signatureUrl: string | null;
  startedAt: string | null;
  completedAt: string | null;
  items: ProofItem[];
};

type ProofItem = {
  id: string;
  rugTag: string;
  phase: string;
  status: string;
  photos: string[];
  notes: string | null;
};

type RouteStopRow = ExtendedTableRow<"route_stops"> & {
  clients?: { name: string } | null;
  profiles?: { display_name: string } | null;
};

type RouteStopItemRow = ExtendedTableRow<"route_stop_items"> & {
  rugs?: { tag: string } | null;
};

export function DeliveryProofBoard() {
  const [stops, setStops] = useState<ProofStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expandedStopIds, setExpandedStopIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchProofs = async () => {
      setLoading(true);
      setError(null);

      const { data: stopsData, error: stopsError } = await supabaseExtended
        .from("route_stops")
        .select("*, clients(name)")
        .gte("route_date", dateFrom)
        .lte("route_date", dateTo)
        .order("route_date", { ascending: false });

      if (stopsError) {
        setError(stopsError.message);
        setLoading(false);
        return;
      }

      const stopsRows = (stopsData ?? []) as unknown as RouteStopRow[];
      const stopIds = stopsRows.map((s) => s.id);

      let itemRows: RouteStopItemRow[] = [];
      if (stopIds.length > 0) {
        const { data, error: itemsError } = await supabaseExtended
          .from("route_stop_items")
          .select("*, rugs(tag)")
          .in("route_stop_id", stopIds);

        if (itemsError) {
          setError(itemsError.message);
          setLoading(false);
          return;
        }
        itemRows = (data ?? []) as unknown as RouteStopItemRow[];
      }

      const proofs: ProofStop[] = stopsRows.map((stop) => {
        const stopItems = itemRows.filter((i) => i.route_stop_id === stop.id);
        return {
          id: stop.id,
          clientName: stop.clients?.name ?? "Unknown",
          driverName: (stop as unknown as { profiles?: { display_name: string } | null }).profiles?.display_name ?? "Unknown Driver",
          routeDate: stop.route_date,
          status: stop.status,
          signatureUrl: stop.signature_data_url,
          startedAt: stop.started_at,
          completedAt: stop.completed_at,
          items: stopItems.map((item) => ({
            id: item.id,
            rugTag: item.rugs?.tag ?? "—",
            phase: item.phase,
            status: item.status,
            photos: item.photo_urls ?? [],
            notes: item.notes,
          })),
        };
      });

      setStops(proofs);
      setLoading(false);
    };

    fetchProofs();
  }, [dateFrom, dateTo]);

  const toggleExpand = (stopId: string) => {
    setExpandedStopIds((prev) => {
      const next = new Set(prev);
      if (next.has(stopId)) next.delete(stopId);
      else next.add(stopId);
      return next;
    });
  };

  const expandAll = () => setExpandedStopIds(new Set(stops.map((s) => s.id)));
  const collapseAll = () => setExpandedStopIds(new Set());

  const totalPhotos = stops.reduce((sum, s) => sum + s.items.reduce((isum, i) => isum + i.photos.length, 0), 0);
  const stopsWithSignature = stops.filter((s) => s.signatureUrl).length;
  const completedStops = stops.filter((s) => s.status === "completed" || s.status === "completed_with_exceptions").length;
  const itemsMissingPhotos = stops.reduce(
    (sum, s) => sum + s.items.filter((i) => i.photos.length === 0 && i.status === "verified").length,
    0,
  );

  // Group by date
  const stopsByDate: Record<string, ProofStop[]> = {};
  stops.forEach((s) => {
    if (!stopsByDate[s.routeDate]) stopsByDate[s.routeDate] = [];
    stopsByDate[s.routeDate].push(s);
  });
  const sortedDates = Object.keys(stopsByDate).sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4 p-4 overflow-auto h-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Delivery & Pickup Proofs</h3>
          <p className="text-xs text-muted-foreground">
            All driver signatures, photos, and verification records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          />
          <label className="text-xs text-muted-foreground">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          />
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-lg font-bold">{stops.length}</p>
          <p className="text-xs text-muted-foreground">Total Stops</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-lg font-bold text-green-600">{completedStops}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-lg font-bold">{totalPhotos}</p>
          <p className="text-xs text-muted-foreground">Photos</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-lg font-bold text-green-600">{stopsWithSignature}</p>
          <p className="text-xs text-muted-foreground">Signatures</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className={cn("text-lg font-bold", itemsMissingPhotos > 0 ? "text-amber-600" : "text-green-600")}>
            {itemsMissingPhotos}
          </p>
          <p className="text-xs text-muted-foreground">Missing Photos</p>
        </div>
      </div>

      {stops.length > 1 && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={expandAll}>
            <ChevronDown className="h-3 w-3 mr-1" /> Expand All
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={collapseAll}>
            <ChevronUp className="h-3 w-3 mr-1" /> Collapse All
          </Button>
        </div>
      )}

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load delivery proofs: {error}
        </div>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading delivery proofs...</p>
      ) : stops.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-8 text-center">
          <ImageOff className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No route stops found for the selected date range.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {sortedDates.map((date) => (
            <div key={date}>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                {format(new Date(date + "T00:00:00"), "EEEE, MMM d, yyyy")}
                <Badge variant="secondary" className="ml-2 text-[10px]">{stopsByDate[date].length} stops</Badge>
              </h4>
              <div className="space-y-2">
                {stopsByDate[date].map((stop) => {
                  const hasPhotos = stop.items.some((i) => i.photos.length > 0);
                  const isExpanded = expandedStopIds.has(stop.id);

                  return (
                    <div key={stop.id} className="rounded-lg border bg-card overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleExpand(stop.id)}
                        className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center",
                            stop.status === "completed" || stop.status === "completed_with_exceptions"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                              : "bg-muted text-muted-foreground",
                          )}>
                            {stop.status === "completed" || stop.status === "completed_with_exceptions"
                              ? <CheckCircle className="h-4 w-4" />
                              : <Camera className="h-4 w-4" />
                            }
                          </div>
                          <div>
                            <span className="text-sm font-medium">{stop.clientName}</span>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="outline" className="text-[10px] h-4">{stop.status}</Badge>
                              {stop.signatureUrl && (
                                <span className="text-[10px] text-green-600 flex items-center gap-0.5">
                                  <Signature className="h-3 w-3" /> Signed
                                </span>
                              )}
                              {!hasPhotos && stop.items.length > 0 && (
                                <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
                                  <AlertTriangle className="h-3 w-3" /> No photos
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px]">
                            {stop.items.reduce((s, i) => s + i.photos.length, 0)} photos
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {stop.items.length} item{stop.items.length !== 1 ? "s" : ""}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t px-4 py-3 space-y-4">
                          {/* Signature preview */}
                          {stop.signatureUrl && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">Customer Signature</p>
                              <div className="h-20 w-56 rounded border bg-white dark:bg-white/10 p-1">
                                <img
                                  src={stop.signatureUrl}
                                  alt="Signature"
                                  className="h-full w-full object-contain"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).parentElement!.innerHTML =
                                      '<p class="text-xs text-muted-foreground p-2">Signature unavailable</p>';
                                  }}
                                />
                              </div>
                            </div>
                          )}

                          {/* Stop timing */}
                          {(stop.startedAt || stop.completedAt) && (
                            <div className="text-xs text-muted-foreground">
                              {stop.startedAt && <span>Started: {format(new Date(stop.startedAt), "h:mm a")}</span>}
                              {stop.startedAt && stop.completedAt && <span> · </span>}
                              {stop.completedAt && <span>Completed: {format(new Date(stop.completedAt), "h:mm a")}</span>}
                            </div>
                          )}

                          {/* Photo grid per item */}
                          {stop.items.map((item) => (
                            <div key={item.id} className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium font-mono">{item.rugTag}</span>
                                <Badge variant="outline" className="text-[10px] h-4">{item.phase}</Badge>
                                <Badge
                                  variant={item.status === "verified" ? "secondary" : "outline"}
                                  className="text-[10px] h-4"
                                >
                                  {item.status}
                                </Badge>
                              </div>
                              {item.notes && (
                                <p className="text-xs text-muted-foreground italic">Note: {item.notes}</p>
                              )}
                              {item.photos.length > 0 ? (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                                  {item.photos.map((url, idx) => (
                                    <div key={idx} className="aspect-square rounded-md overflow-hidden bg-muted border">
                                      <img
                                        src={url}
                                        alt={`${item.rugTag} photo ${idx + 1}`}
                                        className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                        onClick={() => window.open(url, "_blank")}
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = "none";
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground italic">No photos captured</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
