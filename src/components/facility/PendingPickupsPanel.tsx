import { useCallback, useEffect, useState } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Package, Loader2 } from "lucide-react";
import { LoadingState } from "@/components/states/PageState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";
import { RugDetailSheet } from "./RugDetailSheet";

interface ReadyRug {
  id: string;
  tag: string;
  description: string;
  services: string[];
  size_length: number | null;
  size_width: number | null;
  completed_at: string | null;
  client_name: string | null;
}

type ReadyRugRow = Pick<
  Tables<"rugs">,
  "id" | "tag" | "description" | "services" | "size_length" | "size_width" | "completed_at"
> & {
  clients: Pick<Tables<"clients">, "name"> | null;
};

export function PendingPickupsPanel() {
  const [rugs, setRugs] = useState<ReadyRug[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [detailRugId, setDetailRugId] = useState<string | null>(null);
  const pagination = usePaginatedList(rugs);

  const fetchReady = useCallback(async () => {
    const { data, error } = await supabase
      .from("rugs")
      .select("id, tag, description, services, size_length, size_width, completed_at, clients(name)")
      .eq("status", "ready")
      .order("completed_at", { ascending: true })
      .returns<ReadyRugRow[]>();

    if (error) {
      toast({ title: "Error loading pickups", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    setRugs(
      (data ?? []).map((r) => ({
        id: r.id,
        tag: r.tag,
        description: r.description,
        services: r.services ?? [],
        size_length: r.size_length,
        size_width: r.size_width,
        completed_at: r.completed_at,
        client_name: r.clients?.name ?? null,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReady();
  }, [fetchReady]);

  const markPickedUp = async (rugId: string) => {
    setUpdating(rugId);
    const { error } = await supabase
      .from("rugs")
      .update({ status: "picked_up" as const, picked_up_at: new Date().toISOString() })
      .eq("id", rugId);

    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      setUpdating(null);
      return;
    }

    setRugs((prev) => prev.filter((r) => r.id !== rugId));
    toast({ title: "Marked as picked up" });
    setUpdating(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingState title="Loading pickups" description="Fetching ready rugs..." />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 shrink-0">
        <h2 className="text-sm font-semibold">Pending Pickups</h2>
        <Badge variant="outline" className="text-xs">{rugs.length} ready</Badge>
      </div>

      <div className="flex-1 overflow-auto p-3 md:p-4">
        {rugs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Package className="h-8 w-8" />
            <p className="text-sm">No rugs waiting for pickup</p>
          </div>
        ) : (
          <>
          <div className="space-y-2">
            {pagination.items.map((rug) => (
              <div
                key={rug.id}
                className="flex items-center justify-between border rounded-md bg-card px-3 md:px-4 py-3 gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-mono font-bold text-sm text-primary hover:underline cursor-pointer"
                      onClick={() => setDetailRugId(rug.id)}
                    >
                      {rug.tag}
                    </span>
                    {rug.client_name && (
                      <span className="text-sm text-muted-foreground truncate">{rug.client_name}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {rug.size_length ?? "?"}×{rug.size_width ?? "?"} ft
                    {rug.description ? ` · ${rug.description}` : ""}
                  </div>
                  {rug.services.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {rug.services.map((s) => (
                        <Badge key={s} variant="outline" className="text-xs h-5 px-1.5">{s}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => markPickedUp(rug.id)}
                  disabled={updating === rug.id}
                  className="shrink-0"
                >
                  {updating === rug.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Picked Up"
                  )}
                </Button>
              </div>
            ))}
          </div>
          <div className="px-1 pt-2">
            <PaginationControls
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              hasPrev={pagination.hasPrev}
              hasNext={pagination.hasNext}
              onPrev={pagination.prevPage}
              onNext={pagination.nextPage}
              label="rugs"
            />
          </div>
          </>
        )}
      </div>

      <RugDetailSheet
        rugId={detailRugId}
        open={Boolean(detailRugId)}
        onOpenChange={(open) => { if (!open) setDetailRugId(null); }}
      />
    </div>
  );
}
