import { Badge } from "@/components/ui/badge";
import { Camera } from "lucide-react";
import {
  type RugEstimateSummary,
  type RugRow,
  STATUS_LABELS,
  STATUS_VARIANTS,
  PROGRESS_STEPS,
  formatDate,
} from "./portal-rug-types";

interface PortalRugCardProps {
  rug: RugRow;
  estimateSummary?: RugEstimateSummary | null;
  onClick: () => void;
}

function estimateBadge(summary?: RugEstimateSummary | null) {
  if (!summary) return null;
  if (summary.status === "sent") return <Badge className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Estimate pending</Badge>;
  if (summary.status === "approved") return <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Estimate approved</Badge>;
  if (summary.status === "rejected") return <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Estimate declined</Badge>;
  return <Badge variant="outline" className="text-[10px]">Estimate {summary.status}</Badge>;
}

export default function PortalRugCard({ rug, estimateSummary, onClick }: PortalRugCardProps) {
  const stepIndex = PROGRESS_STEPS.indexOf(rug.status);

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border bg-card p-3 hover:shadow-md hover:border-primary/30 transition-all"
    >
      <div className="flex items-start gap-3">
        {/* Thumbnail */}
        <div className="h-14 w-14 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {rug.photo_url ? (
            <img src={rug.photo_url} alt={rug.tag} className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold font-mono">{rug.tag}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatDate(rug.checked_in_at)}
            </span>
          </div>

          {(rug.size_length || rug.size_width) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {rug.size_length ?? 0}&apos; × {rug.size_width ?? 0}&apos;
            </p>
          )}

          {/* Service badges */}
          {rug.services && rug.services.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {rug.services.map((s) => (
                <span
                  key={s}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                >
                  {s}
                </span>
              ))}
            </div>
          )}

          {estimateSummary ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {estimateBadge(estimateSummary)}
              <span className="text-[10px] text-muted-foreground">{estimateSummary.estimateNumber} · ${estimateSummary.total.toFixed(2)}</span>
            </div>
          ) : null}

          {/* Progress stepper */}
          <div className="flex items-center gap-1 mt-2">
            {PROGRESS_STEPS.map((step, i) => {
              const filled = stepIndex >= i;
              return (
                <div key={step} className="flex items-center gap-1">
                  {i > 0 && (
                    <div
                      className={`h-0.5 w-4 ${
                        stepIndex >= i ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  )}
                  <div
                    className={`h-2 w-2 rounded-full ${
                      filled ? "bg-primary" : "bg-muted"
                    }`}
                  />
                </div>
              );
            })}
            <Badge
              variant={STATUS_VARIANTS[rug.status] ?? "outline"}
              className="text-[10px] ml-1.5"
            >
              {STATUS_LABELS[rug.status] ?? rug.status}
            </Badge>
          </div>
        </div>
      </div>
    </button>
  );
}
