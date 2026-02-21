import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PRODUCTION_STAGES } from "@/data/production";
import type { DbRug } from "./ProductionBoard";

interface Props {
  rug: DbRug;
  onAdvanceStage: (rugId: string) => void;
}

export function ProductionRugCard({ rug, onAdvanceStage }: Props) {
  const [expanded, setExpanded] = useState(false);
  const stageIndex = PRODUCTION_STAGES.findIndex((s) => s.id === rug.status);
  const isLastStage = stageIndex === PRODUCTION_STAGES.length - 1;

  return (
    <div className="rounded-md border bg-card text-card-foreground shadow-sm">
      <button
        className="w-full text-left px-3 py-2.5 flex items-start justify-between gap-2"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm">{rug.tag}</span>
            {rug.client_name && (
              <span className="text-sm text-muted-foreground truncate">{rug.client_name}</span>
            )}
          </div>
          {(rug.size_length || rug.size_width) && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {rug.size_length ?? "?"}×{rug.size_width ?? "?"} ft
              {rug.description ? ` · ${rug.description}` : ""}
            </div>
          )}
          {rug.services.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {rug.services.map((s, i) => {
                const edgeLabel = s.edges && s.edges.length > 0 && s.edges.length < 4
                  ? ` (${s.edges.map(e => e === "end1" ? "E1" : e === "end2" ? "E2" : e === "side1" ? "S1" : "S2").join("+")})`
                  : "";
                return (
                  <Badge key={i} variant="outline" className="text-xs h-5 px-1.5">
                    {s.name}{edgeLabel}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        )}
      </button>

      {expanded && (
        <div className="border-t px-3 py-2.5 space-y-2">
          {rug.notes && (
            <p className="text-xs text-muted-foreground">{rug.notes}</p>
          )}
          <div className="text-xs text-muted-foreground">
            Checked in: {new Date(rug.checked_in_at).toLocaleString()}
          </div>
          {!isLastStage && (
            <Button size="sm" onClick={() => onAdvanceStage(rug.id)}>
              Advance to {PRODUCTION_STAGES[stageIndex + 1]?.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
