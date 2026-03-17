import { useState } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PRODUCTION_STAGES } from "@/data/production";
import { ServiceChecklistDialog } from "./ServiceChecklistDialog";
import type { DbRug } from "./ProductionBoard";

interface Props {
  rug: DbRug;
  onAdvanceStage: (rugId: string) => void;
  onViewDetail?: (rugId: string) => void;
}

export function ProductionRugCard({ rug, onAdvanceStage, onViewDetail }: Props) {
  const stageIndex = PRODUCTION_STAGES.findIndex((s) => s.id === rug.status);
  const nextStage = stageIndex < PRODUCTION_STAGES.length - 1 ? PRODUCTION_STAGES[stageIndex + 1] : null;
  const [checklistOpen, setChecklistOpen] = useState(false);

  const totalServices = rug.services.length;
  const completedServices = rug.servicesCompletedCount;
  const allDone = totalServices > 0 && completedServices === totalServices;

  return (
    <>
      <div className="rounded-md border bg-card text-card-foreground shadow-sm hover:shadow transition-shadow">
        <div className="px-2.5 py-2 space-y-1">
          {/* Row 1: Tag + client + advance */}
          <div className="flex items-center gap-1.5">
            <span
              className={`font-mono font-bold text-sm leading-tight ${onViewDetail ? "text-primary hover:underline cursor-pointer" : ""}`}
              onClick={onViewDetail ? () => onViewDetail(rug.id) : undefined}
            >
              {rug.tag}
            </span>
            {rug.client_name && (
              <span className="text-xs text-muted-foreground truncate">{rug.client_name}</span>
            )}
            {nextStage && (
              <button
                onClick={(e) => { e.stopPropagation(); onAdvanceStage(rug.id); }}
                className="ml-auto shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 rounded px-1.5 py-0.5 transition-colors"
                title={`Advance to ${nextStage.label}`}
              >
                <ArrowRight className="h-3 w-3" />
                {nextStage.label}
              </button>
            )}
          </div>

          {/* Row 2: Dimensions + services inline */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(rug.size_length || rug.size_width) && (
              <span className="text-[11px] text-muted-foreground">
                {rug.size_length ?? "?"}×{rug.size_width ?? "?"} ft
                {rug.description ? ` · ${rug.description}` : ""}
              </span>
            )}
            {totalServices > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setChecklistOpen(true); }}
                className={`inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 transition-colors ${
                  allDone
                    ? "text-green-700 bg-green-100 hover:bg-green-200 dark:text-green-400 dark:bg-green-900/30 dark:hover:bg-green-900/50"
                    : "text-muted-foreground bg-muted hover:bg-muted/80"
                }`}
                title="View service checklist"
              >
                <CheckCircle2 className="h-3 w-3" />
                {completedServices}/{totalServices}
              </button>
            )}
            {rug.services.length > 0 && (
              <>
                {rug.services.slice(0, 3).map((s, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] h-4 px-1 leading-none">
                    {s.name}
                  </Badge>
                ))}
                {rug.services.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{rug.services.length - 3}</span>
                )}
              </>
            )}
          </div>

          {/* Notes inline if present */}
          {rug.notes && (
            <p className="text-[11px] text-muted-foreground/70 truncate">{rug.notes}</p>
          )}
        </div>
      </div>

      {checklistOpen && (
        <ServiceChecklistDialog
          open={checklistOpen}
          onOpenChange={setChecklistOpen}
          rugId={rug.id}
          rugTag={rug.tag}
        />
      )}
    </>
  );
}
