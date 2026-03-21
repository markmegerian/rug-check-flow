import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Camera, CheckCircle, AlertTriangle, ImageOff, Signature } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { cn } from "@/lib/utils";
import type { ExtendedTableRow } from "@/integrations/supabase/extended";

type ProofStop = {
  id: string;
  clientName: string;
  routeDate: string;
  status: string;
  signatureUrl: string | null;
  items: ProofItem[];
};

type ProofItem = {
  id: string;
  rugTag: string;
  phase: string;
  status: string;
  photos: string[];
};

type RouteStopRow = ExtendedTableRow<"route_stops"> & {
  clients?: { name: string } | null;
};

type RouteStopItemRow = ExtendedTableRow<"route_stop_items"> & {
  rugs?: { tag: string } | null;
};

export function DeliveryProofBoard() {
  const [stops, setStops] = useState<ProofStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);

  useEffect(() => {
    const fetchProofs = async () => {
      setLoading(true);
      setError(null);

      const { data: stopsData, error: stopsError } = await supabaseExtended
        .from("route_stops")
        .select("*, clients(name)")
        .eq("route_date", selectedDate)
        .order("created_at", { ascending: true });

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
          routeDate: stop.route_date,
          status: stop.status,
          signatureUrl: stop.signature_data_url,
          items: stopItems.map((item) => ({
            id: item.id,
            rugTag: item.rugs?.tag ?? "—",
            phase: item.phase,
            status: item.status,
            photos: item.photo_urls ?? [],
          })),
        };
      });

      setStops(proofs);
      setLoading(false);
    };

    fetchProofs();
  }, [selectedDate]);

  const totalPhotos = stops.reduce((sum, s) => sum + s.items.reduce((isum, i) => isum + i.photos.length, 0), 0);
  const stopsWithSignature = stops.filter((s) => s.signatureUrl).length;
  const itemsMissingPhotos = stops.reduce(
    (sum, s) => sum + s.items.filter((i) => i.photos.length === 0 && i.status === "verified").length,
    0
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Delivery Proof Board</h3>
          <p className="text-xs text-muted-foreground">
            Photo and signature verification for completed deliveries.
          </p>
        </div>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-sm"
        />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-lg font-bold">{stops.length}</p>
          <p className="text-xs text-muted-foreground">Stops</p>
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
          <p className="text-xs text-muted-foreground">Items w/o Photos</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load delivery proofs: {error}
        </div>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Loading delivery proofs...</p>
      ) : stops.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-8 text-center">
          <ImageOff className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No deliveries found for {selectedDate}.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stops.map((stop) => {
            const hasPhotos = stop.items.some((i) => i.photos.length > 0);
            const isExpanded = expandedStopId === stop.id;

            return (
              <div key={stop.id} className="rounded-lg border bg-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedStopId(isExpanded ? null : stop.id)}
                  className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center",
                      stop.status === "completed" || stop.status === "completed_with_exceptions"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                        : "bg-muted text-muted-foreground"
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
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t px-4 py-3 space-y-3">
                    {/* Signature preview */}
                    {stop.signatureUrl && (
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground">Customer Signature</p>
                        <div className="h-16 w-48 rounded border bg-white dark:bg-white/10 p-1">
                          <img
                            src={stop.signatureUrl}
                            alt="Signature"
                            className="h-full w-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).parentElement!.innerHTML = '<p class="text-xs text-muted-foreground p-2">Signature unavailable</p>'; }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Photo grid per item */}
                    {stop.items.map((item) => (
                      <div key={item.id} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium font-mono">{item.rugTag}</span>
                          <Badge variant="outline" className="text-[10px] h-4">{item.phase}</Badge>
                          <Badge variant={item.status === "verified" ? "secondary" : "outline"} className="text-[10px] h-4">
                            {item.status}
                          </Badge>
                        </div>
                        {item.photos.length > 0 ? (
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                            {item.photos.map((url, idx) => (
                              <div key={idx} className="aspect-square rounded-md overflow-hidden bg-muted border">
                                <img
                                  src={url}
                                  alt={`${item.rugTag} photo ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
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
      )}
    </div>
  );
}
