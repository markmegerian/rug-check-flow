import { Badge } from "@/components/ui/badge";
import { ImageOff } from "lucide-react";

import {
  type RugRow,
  PROGRESS_STEPS,
  STATUS_LABELS,
  formatDate,
} from "./portal-rug-types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PortalRugCardProps {
  rug: RugRow;
  onClick: () => void;
}

// ---------------------------------------------------------------------------
// Progress Stepper
// ---------------------------------------------------------------------------

function ProgressStepper({ status }: { status: RugRow["status"] }) {
  const activeIndex = PROGRESS_STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center gap-0">
      {PROGRESS_STEPS.map((step, i) => {
        const filled = i <= activeIndex;
        const isLast = i === PROGRESS_STEPS.length - 1;
        return (
          <div key={step.key} className="flex items-center">
            <div
              className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                filled ? "bg-primary" : "bg-border"
              }`}
            />
            {!isLast && (
              <div
                className={`h-0.5 w-6 ${
                  i < activeIndex ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
      <span className="text-xs text-muted-foreground ml-2 whitespace-nowrap">
        {STATUS_LABELS[status]}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card Component
// ---------------------------------------------------------------------------

export function PortalRugCard({ rug, onClick }: PortalRugCardProps) {
  const hasDimensions = rug.size_length != null && rug.size_width != null;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 p-3 text-left rounded-lg border bg-card hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
    >
      {/* Photo thumbnail */}
      <div className="h-14 w-14 rounded-md border bg-muted shrink-0 overflow-hidden flex items-center justify-center">
        {rug.photo_url ? (
          <img
            src={rug.photo_url}
            alt={`Rug ${rug.tag}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageOff className="h-5 w-5 text-muted-foreground/50" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Line 1: Tag + dimensions + date */}
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-mono font-semibold text-sm text-foreground">
            {rug.tag}
          </span>
          {hasDimensions && (
            <span className="text-xs text-muted-foreground">
              {Number(rug.size_length)}' × {Number(rug.size_width)}'
            </span>
          )}
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {formatDate(rug.checked_in_at)}
          </span>
        </div>

        {/* Line 2: Service badges */}
        {rug.services.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {rug.services.map((service) => (
              <Badge key={service} variant="secondary" className="text-[11px]">
                {service}
              </Badge>
            ))}
          </div>
        )}

        {/* Line 3: Progress stepper */}
        <ProgressStepper status={rug.status} />
      </div>
    </button>
  );
}
