import { History, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type HistoricalRug } from "@/hooks/useRugHistory";

interface RugHistoryCardProps {
  similarRugs: HistoricalRug[];
  onCopyServices: (services: string[]) => void;
}

export function RugHistoryCard({ similarRugs, onCopyServices }: RugHistoryCardProps) {
  if (similarRugs.length === 0) return null;

  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <History className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        <span className="text-xs font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-wide">
          Previously serviced
        </span>
      </div>
      <p className="text-xs text-blue-700/80 dark:text-blue-300/80">
        Similar rugs from this client found. Reuse previous services?
      </p>
      <div className="space-y-1.5">
        {similarRugs.map((rug) => (
          <div
            key={rug.id}
            className="flex items-center justify-between gap-2 rounded-md bg-white/60 dark:bg-white/5 px-2.5 py-2 border border-blue-100 dark:border-blue-900"
          >
            <div className="min-w-0">
              <div className="text-xs font-medium font-mono">{rug.tag}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {rug.services?.slice(0, 3).map((s) => (
                  <Badge key={s} variant="secondary" className="text-[10px] h-4">
                    {s}
                  </Badge>
                ))}
                {(rug.services?.length ?? 0) > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{rug.services.length - 3} more
                  </span>
                )}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {rug.size_length}&apos; x {rug.size_width}&apos; &middot;{" "}
                {new Date(rug.checked_in_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            </div>
            {rug.services && rug.services.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 shrink-0"
                onClick={() => onCopyServices(rug.services)}
              >
                <Copy className="h-3 w-3" />
                Use
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
