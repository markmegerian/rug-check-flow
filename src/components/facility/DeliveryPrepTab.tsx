import { useState, useEffect, useMemo } from "react";
import { Package, RefreshCw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RugStatusBadge } from "@/components/shared/StatusBadge";
import { RugDetailSheet } from "@/components/facility/RugDetailSheet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type RugRow = {
  id: string;
  tag: string;
  description: string;
  status: string;
  size_length: number | null;
  size_width: number | null;
  client_id: string | null;
};

type ClientRow = {
  id: string;
  name: string;
  address: string;
  route_day: string;
};

export function DeliveryPrepTab() {
  const { toast } = useToast();
  const [rugs, setRugs] = useState<RugRow[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRugId, setSelectedRugId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchData = async () => {
    try {
      const [{ data: rugsData, error: rugsError }, { data: clientsData }] = await Promise.all([
        supabase
          .from("rugs")
          .select("id, tag, description, status, size_length, size_width, client_id")
          .in("status", ["checked_in", "in_production", "ready"])
          .not("client_id", "is", null)
          .order("tag"),
        supabase
          .from("clients")
          .select("id, name, address, route_day")
          .order("name"),
      ]);

      if (rugsError) {
        toast({ title: "Failed to load rugs", description: rugsError.message, variant: "destructive" });
        return;
      }

      setRugs((rugsData ?? []) as RugRow[]);
      setClients((clientsData ?? []) as ClientRow[]);
    } catch {
      toast({ title: "Failed to load data", variant: "destructive" });
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
  };

  const clientMap = useMemo(() => {
    const map: Record<string, ClientRow> = {};
    clients.forEach((c) => { map[c.id] = c; });
    return map;
  }, [clients]);

  // Group rugs by client, only include clients that have rugs
  const rugsByClient = useMemo(() => {
    const map: Record<string, RugRow[]> = {};
    rugs.forEach((r) => {
      const cid = r.client_id!;
      if (!map[cid]) map[cid] = [];
      map[cid].push(r);
    });
    // Sort client groups by name
    return Object.entries(map).sort(([a], [b]) => {
      const nameA = clientMap[a]?.name ?? "";
      const nameB = clientMap[b]?.name ?? "";
      return nameA.localeCompare(nameB);
    });
  }, [rugs, clientMap]);

  const openRug = (rugId: string) => {
    setSelectedRugId(rugId);
    setSheetOpen(true);
  };

  const readyCount = rugs.filter((r) => r.status === "ready").length;
  const inProductionCount = rugs.filter((r) => r.status === "in_production").length;
  const checkedInCount = rugs.filter((r) => r.status === "checked_in").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading delivery prep…
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 overflow-auto h-full animate-fade-in-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Delivery Prep</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {rugs.length} rugs at facility · {readyCount} ready · {inProductionCount} in production · {checkedInCount} checked in
            {" · "}{rugsByClient.length} clients
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {rugs.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">No rugs currently at the facility.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rugsByClient.map(([clientId, clientRugs]) => {
            const client = clientMap[clientId];
            const clientReady = clientRugs.filter((r) => r.status === "ready").length;

            return (
              <div key={clientId} className="border border-border rounded-lg overflow-hidden bg-card">
                <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm text-foreground">{client?.name ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">
                      {client?.address || "No address"}
                      {client?.route_day ? ` · ${client.route_day}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{clientRugs.length} rugs</Badge>
                    {clientReady > 0 && (
                      <Badge variant="default" className="text-xs bg-green-600">{clientReady} ready</Badge>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-border">
                  {clientRugs.map((rug) => (
                    <button
                      key={rug.id}
                      type="button"
                      onClick={() => openRug(rug.id)}
                      className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors text-left"
                    >
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
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
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
            // Refresh to pick up any status changes made in the sheet
            fetchData();
          }
        }}
      />
    </div>
  );
}
