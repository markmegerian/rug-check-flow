import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PRODUCTION_STAGES } from "@/data/production";
import type { DbRug } from "./ProductionBoard";

interface Props {
  rug: DbRug;
  onAdvanceStage: (rugId: string) => void;
  onViewDetail?: (rugId: string) => void;
  deliveryDate?: string;
  deliveryStatus?: string;
}

export function ProductionRugCard({ rug, onAdvanceStage, onViewDetail, deliveryDate, deliveryStatus }: Props) {
  const stageIndex = PRODUCTION_STAGES.findIndex((s) => s.id === rug.status);
  const isLastStage = stageIndex === PRODUCTION_STAGES.length - 1;
  const nextStageLabel = !isLastStage ? PRODUCTION_STAGES[stageIndex + 1]?.label : null;

  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className="font-mono text-base font-bold text-primary hover:underline"
              onClick={() => onViewDetail?.(rug.id)}
            >
              {rug.tag}
            </button>
            <Badge variant="outline" className="text-[10px] h-5">
              {PRODUCTION_STAGES.find((stage) => stage.id === rug.status)?.label ?? rug.status}
            </Badge>
            {rug.client_name ? <span className="text-sm text-muted-foreground truncate">{rug.client_name}</span> : null}
          </div>

          <div className="text-sm text-muted-foreground">
            {(rug.size_length || rug.size_width) ? `${rug.size_length ?? "?"}×${rug.size_width ?? "?"} ft` : "Size not set"}
            {rug.description ? ` · ${rug.description}` : ""}
          </div>

          {rug.services.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {rug.services.slice(0, 4).map((service, i) => (
                <Badge key={`${service.name}-${i}`} variant="secondary" className="text-[10px] h-5 px-1.5">
                  {service.name}
                </Badge>
              ))}
              {rug.services.length > 4 && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                  +{rug.services.length - 4} more
                </Badge>
              )}
            </div>
          )}

          {rug.notes ? (
            <p className="text-xs text-muted-foreground line-clamp-2">{rug.notes}</p>
          ) : null}

          {deliveryDate && (
            <div className="flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400">
              <Truck className="h-3 w-3" />
              Delivery {new Date(deliveryDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {deliveryStatus === "confirmed" ? " · Confirmed" : ""}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => onViewDetail?.(rug.id)}>
            Open
          </Button>
          {nextStageLabel ? (
            <Button size="sm" onClick={() => onAdvanceStage(rug.id)}>
              Advance to {nextStageLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
