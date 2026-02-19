import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PRODUCTION_STAGES,
  SEED_PRODUCTION_RUGS,
  ProductionRug,
  ServiceTask,
  currentStaffName,
} from "@/data/production";
import { ProductionRugCard } from "./ProductionRugCard";

export function ProductionBoard() {
  const [rugs, setRugs] = useState<ProductionRug[]>(SEED_PRODUCTION_RUGS);
  const [editMode, setEditMode] = useState(false);

  const handleUpdateServices = (rugId: string, services: ServiceTask[]) => {
    setRugs((prev) =>
      prev.map((r) => (r.id === rugId ? { ...r, services } : r))
    );
  };

  const handleAdvanceStage = (rugId: string) => {
    setRugs((prev) =>
      prev.map((r) => {
        if (r.id !== rugId) return r;
        const idx = PRODUCTION_STAGES.findIndex((s) => s.id === r.stage);
        if (idx < 0 || idx >= PRODUCTION_STAGES.length - 1) return r;
        return { ...r, stage: PRODUCTION_STAGES[idx + 1].id };
      })
    );
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Production Board</h2>
          <Badge variant="outline" className="text-xs">
            Staff: {currentStaffName}
          </Badge>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <span className="text-muted-foreground">Edit Mode</span>
          <Switch checked={editMode} onCheckedChange={setEditMode} />
        </label>
      </div>

      {/* Columns */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex h-full min-w-max">
          {PRODUCTION_STAGES.map((stage) => {
            const stageRugs = rugs.filter((r) => r.stage === stage.id);
            return (
              <div
                key={stage.id}
                className="flex flex-col w-64 border-r last:border-r-0 shrink-0"
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/20">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {stage.label}
                  </span>
                  <Badge variant="secondary" className="text-xs h-5 min-w-5 justify-center">
                    {stageRugs.length}
                  </Badge>
                </div>
                {/* Column body */}
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-2">
                    {stageRugs.map((rug) => (
                      <ProductionRugCard
                        key={rug.id}
                        rug={rug}
                        editMode={editMode}
                        onUpdateServices={handleUpdateServices}
                        onAdvanceStage={handleAdvanceStage}
                      />
                    ))}
                    {stageRugs.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-6">
                        No rugs
                      </p>
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
