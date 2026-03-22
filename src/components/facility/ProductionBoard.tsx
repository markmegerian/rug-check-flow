import { useMemo, useState } from "react";
import { CheckSquare, Search, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { PRODUCTION_STAGES, ProductionStage } from "@/data/production";
import { ProductionRugCard } from "./ProductionRugCard";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { advanceRugStage } from "@/lib/rug-operations";
import { useRugs, useInvalidateRugs, type RugWithServices } from "@/hooks/useRugs";
import { useDeliveryAllocations } from "@/hooks/useDeliveryAllocations";
import { RugDetailSheet } from "./RugDetailSheet";

export type DbRug = RugWithServices;

export function ProductionBoard() {
  const { data: rugs = [], isLoading: loading } = useRugs();
  const invalidateRugs = useInvalidateRugs();
  const { data: deliveryAllocations } = useDeliveryAllocations();
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [detailRugId, setDetailRugId] = useState<string | null>(null);
  const [selectedRugIds, setSelectedRugIds] = useState<Set<string>>(new Set());
  const [bulkAdvancing, setBulkAdvancing] = useState(false);

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
    const result = await advanceRugStage(rugId, rug.status);
    if (!result) return;
    if (result.error) {
      toast({ title: "Update failed", description: result.error, variant: "destructive" });
      return;
    }
    invalidateRugs();
  };

  const toggleSelection = (rugId: string) => {
    setSelectedRugIds((prev) => {
      const next = new Set(prev);
      if (next.has(rugId)) next.delete(rugId);
      else next.add(rugId);
      return next;
    });
  };

  const selectAllInStage = (stageId: string) => {
    const stageRugIds = filteredRugs.filter((r) => r.status === stageId).map((r) => r.id);
    setSelectedRugIds((prev) => {
      const allSelected = stageRugIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        stageRugIds.forEach((id) => next.delete(id));
      } else {
        stageRugIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleBulkAdvance = async () => {
    if (selectedRugIds.size === 0) return;
    setBulkAdvancing(true);

    const selected = rugs.filter((r) => selectedRugIds.has(r.id));
    let advanced = 0;

    for (const rug of selected) {
      const result = await advanceRugStage(rug.id, rug.status);
      if (result && !result.error) advanced++;
    }

    setSelectedRugIds(new Set());
    setBulkAdvancing(false);
    invalidateRugs();
    toast({ title: `Advanced ${advanced} rug(s)`, description: `${advanced} of ${selected.length} rugs moved to next stage.` });
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
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/30 shrink-0 flex-wrap">
        <h2 className="text-sm font-semibold">Production Board</h2>
        <Badge variant="outline" className="text-xs">
          {search ? `${filteredRugs.length} of ${rugs.length}` : `${rugs.length}`} rugs
        </Badge>
        {selectedRugIds.size > 0 && (
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-xs">{selectedRugIds.size} selected</Badge>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleBulkAdvance}
              disabled={bulkAdvancing}
            >
              {bulkAdvancing ? "Advancing..." : "Advance selected"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setSelectedRugIds(new Set())}
            >
              Clear
            </Button>
          </div>
        )}
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
                <ProductionRugCard key={rug.id} rug={rug} onAdvanceStage={handleAdvanceStage} onViewDetail={setDetailRugId} deliveryDate={deliveryAllocations?.get(rug.id)?.target_date} deliveryStatus={deliveryAllocations?.get(rug.id)?.status} selected={selectedRugIds.has(rug.id)} onToggleSelect={() => toggleSelection(rug.id)} />
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
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => selectAllInStage(stage.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title={`Select all ${stage.label}`}
                    >
                      {stageRugs.length > 0 && stageRugs.every((r) => selectedRugIds.has(r.id))
                        ? <CheckSquare className="h-3.5 w-3.5 text-primary" />
                        : <Square className="h-3.5 w-3.5" />
                      }
                    </button>
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {stage.label}
                    </span>
                  </div>
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
