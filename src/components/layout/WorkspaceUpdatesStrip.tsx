import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type WorkspaceUpdateTone = "neutral" | "info" | "success" | "warning" | "danger";

export type WorkspaceUpdateItem = {
  id: string;
  label: string;
  value: string | number;
  detail?: string;
  tone?: WorkspaceUpdateTone;
};

interface WorkspaceUpdatesStripProps {
  title?: string;
  updates: WorkspaceUpdateItem[];
  loading?: boolean;
  className?: string;
}

const TONE_CLASSNAME: Record<WorkspaceUpdateTone, string> = {
  neutral: "border-border bg-card",
  info: "border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30",
  success: "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/30",
  warning: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30",
  danger: "border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30",
};

export function WorkspaceUpdatesStrip({
  title = "Updates & reminders",
  updates,
  loading = false,
  className,
}: WorkspaceUpdatesStripProps) {
  return (
    <section className={cn("rounded-xl border border-border bg-card px-3 md:px-4 py-3", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="rounded-lg border border-border bg-background px-3 py-2.5 space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-12" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {updates.map((update) => {
            const tone = update.tone ?? "neutral";
            return (
              <div
                key={update.id}
                className={cn("rounded-lg border px-3 py-2.5", TONE_CLASSNAME[tone])}
              >
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{update.label}</p>
                <p className="text-lg font-semibold leading-tight mt-0.5">{update.value}</p>
                {update.detail ? <p className="text-xs text-muted-foreground">{update.detail}</p> : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
