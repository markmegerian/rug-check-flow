import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTION_STAGES, ProductionStage } from "@/data/production";
import { ProductionRugCard } from "./ProductionRugCard";
import { toast } from "@/hooks/use-toast";

export interface DbRug {
  id: string;
  tag: string;
  description: string;
  services: string[];
  status: ProductionStage;
  size_length: number | null;
  size_width: number | null;
  checked_in_at: string;
  notes: string;
  client_name: string | null;
}

export function ProductionBoard() {
  const [rugs, setRugs] = useState<DbRug[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRugs = async () => {
    const { data, error } = await supabase
      .from("rugs")
      .select("id, tag, description, services, status, size_length, size_width, checked_in_at, notes, clients(name)")
      .order("checked_in_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading rugs", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    setRugs(
      (data ?? []).map((r: any) => ({
        id: r.id,
        tag: r.tag,
        description: r.description,
        services: r.services ?? [],
        status: r.status as ProductionStage,
        size_length: r.size_length,
        size_width: r.size_width,
        checked_in_at: r.checked_in_at,
        notes: r.notes,
        client_name: r.clients?.name ?? null,
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchRugs();
  }, []);

  const handleAdvanceStage = async (rugId: string) => {
    const rug = rugs.find((r) => r.id === rugId);
    if (!rug) return;
    const idx = PRODUCTION_STAGES.findIndex((s) => s.id === rug.status);
    if (idx < 0 || idx >= PRODUCTION_STAGES.length - 1) return;

    const nextStage = PRODUCTION_STAGES[idx + 1].id;
    const updates: Record<string, any> = { status: nextStage };
    if (nextStage === "ready") updates.completed_at = new Date().toISOString();
    if (nextStage === "picked_up") updates.picked_up_at = new Date().toISOString();

    const { error } = await supabase.from("rugs").update(updates).eq("id", rugId);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }

    setRugs((prev) =>
      prev.map((r) => (r.id === rugId ? { ...r, status: nextStage } : r))
    );
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4">
          {PRODUCTION_STAGES.map((s) => (
            <Skeleton key={s.id} className="h-64 w-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 shrink-0">
        <h2 className="text-sm font-semibold">Production Board</h2>
        <Badge variant="outline" className="text-xs">{rugs.length} rugs</Badge>
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="flex h-full min-w-max">
          {PRODUCTION_STAGES.map((stage) => {
            const stageRugs = rugs.filter((r) => r.status === stage.id);
            return (
              <div key={stage.id} className="flex flex-col w-64 border-r last:border-r-0 shrink-0">
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {stage.label}
                  </span>
                  <Badge variant="secondary" className="text-xs h-5 min-w-5 justify-center">
                    {stageRugs.length}
                  </Badge>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-2">
                    {stageRugs.map((rug) => (
                      <ProductionRugCard
                        key={rug.id}
                        rug={rug}
                        onAdvanceStage={handleAdvanceStage}
                      />
                    ))}
                    {stageRugs.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">No rugs</p>
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
