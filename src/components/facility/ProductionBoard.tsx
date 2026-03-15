import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCTION_STAGES, ProductionStage } from "@/data/production";
import { ProductionRugCard } from "./ProductionRugCard";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useRugs, useInvalidateRugs, type RugWithServices } from "@/hooks/useRugs";
import { RugDetailSheet } from "./RugDetailSheet";

export type DbRug = RugWithServices;

export function ProductionBoard() {
  const { data: rugs = [], isLoading: loading } = useRugs();
  const invalidateRugs = useInvalidateRugs();
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [detailRugId, setDetailRugId] = useState<string | null>(null);

  const filteredRugs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rugs;
    return rugs.filter((r) =>
      r.tag.toLowerCase().includes(q) ||
      (r.client_name ?? "").toLowerCase().includes(q)
    );
  }, [rugs, search]);

  const handleAdvanceStage = async (rugId: string) => {
    const rug = rugs.find((r) => r.id === rugId);
    if (!rug) return;
    const idx = PRODUCTION_STAGES.findIndex((s) => s.id === rug.status);
    if (idx < 0 || idx >= PRODUCTION_STAGES.length - 1) return;

    const nextStage = PRODUCTION_STAGES[idx + 1].id;
    const updates: Record<string, string> = { status: nextStage };
    if (nextStage === "ready") updates.completed_at = new Date().toISOString();
    if (nextStage === "picked_up") updates.picked_up_at = new Date().toISOString();

    const { error } = await supabase.from("rugs").update(updates).eq("id", rugId);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }

    invalidateRugs();
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4 overflow-x-auto">
          {PRODUCTION_STAGES.map((s) => (
            <Skeleton key={s.id} className="h-64 w-64 shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  // On mobile, show stage tabs; on desktop, show columns
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 shrink-0">
        <h2 className="text-sm font-semibold">Production Board</h2>
        <Badge variant="outline" className="text-xs">
          {search ? `${filteredRugs.length} of ${rugs.length}` : `${rugs.length}`} rugs
        </Badge>
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tag or client..."
            className="pl-7 h-7 w-[180px] text-xs"
          />
        </div>
      </div>

      {/* Mobile: stage tabs */}
      <div className="flex md:hidden border-b border-border overflow-x-auto shrink-0">
        {PRODUCTION_STAGES.map((stage) => {
          const count = filteredRugs.filter((r) => r.status === stage.id).length;
          const isActive = (activeStage ?? PRODUCTION_STAGES[0].id) === stage.id;
          return (
            <button
              key={stage.id}
              onClick={() => setActiveStage(stage.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                isActive
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground"
              )}
            >
              {stage.label}
              <Badge variant="secondary" className="text-xs h-4 min-w-4 px-1 justify-center">
                {count}
              </Badge>
            </button>
          );
        })}
      </div>

      {/* Mobile: single stage content */}
      <div className="flex-1 overflow-auto md:hidden p-2">
        {(() => {
          const stageId = activeStage ?? PRODUCTION_STAGES[0].id;
          const stageRugs = filteredRugs.filter((r) => r.status === stageId);
          return (
            <div className="space-y-2">
              {stageRugs.map((rug) => (
                <ProductionRugCard key={rug.id} rug={rug} onAdvanceStage={handleAdvanceStage} onViewDetail={setDetailRugId} />
              ))}
              {stageRugs.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No rugs</p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Desktop: column layout */}
      <div className="flex-1 overflow-x-auto hidden md:block">
        <div className="flex h-full min-w-max">
          {PRODUCTION_STAGES.map((stage) => {
            const stageRugs = filteredRugs.filter((r) => r.status === stage.id);
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
                        onViewDetail={setDetailRugId}
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

      <RugDetailSheet
        rugId={detailRugId}
        open={Boolean(detailRugId)}
        onOpenChange={(open) => { if (!open) setDetailRugId(null); }}
      />
    </div>
  );
}
