import { Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PRODUCTION_STAGES } from "@/data/production";
import type { DbRug } from "./ProductionBoard";

interface Props {
  rug: DbRug;
  onViewDetail?: (rugId: string) => void;
  deliveryDate?: string;
  deliveryStatus?: string;
}

export function ProductionRugCard({ rug, onViewDetail, deliveryDate, deliveryStatus }: Props) {
  return (
    <button
      type="button"
      className="w-full rounded-lg border bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/30"
      onClick={() => onViewDetail?.(rug.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-base font-bold text-primary">
              {rug.tag}
            </span>
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

      </div>
    </button>
  );
}
