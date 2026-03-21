import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { OperationalReminder } from "@/hooks/useOperationalReminders";

interface SlaHeatmapProps {
  reminders: OperationalReminder[];
  loading?: boolean;
}

const HEAT_COLORS: Record<string, string> = {
  "0": "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200",
  "low": "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200",
  "medium": "bg-orange-200 dark:bg-orange-900/40 text-orange-900 dark:text-orange-200",
  "high": "bg-red-200 dark:bg-red-900/50 text-red-900 dark:text-red-200",
  "critical": "bg-red-400 dark:bg-red-800/60 text-white dark:text-red-100",
};

function getHeatLevel(count: number): string {
  if (count === 0) return "0";
  if (count <= 2) return "low";
  if (count <= 5) return "medium";
  if (count <= 10) return "high";
  return "critical";
}

const CATEGORY_LABELS: Record<string, string> = {
  "stale-estimates": "Estimates",
  "stale-pickups": "Pickups",
  "overdue-invoices": "Invoices",
};

export function SlaHeatmap({ reminders, loading }: SlaHeatmapProps) {
  if (loading || reminders.length === 0) return null;

  const bandLabels = ["3-4d", "5-6d", "7+d"];

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        SLA Heatmap
      </h4>
      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_repeat(3,_64px)_64px] border-b bg-muted/30">
          <div className="px-3 py-2 text-[11px] font-medium text-muted-foreground" />
          {bandLabels.map((label) => (
            <div
              key={label}
              className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground"
            >
              {label}
            </div>
          ))}
          <div className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">
            Total
          </div>
        </div>

        {/* Data rows */}
        {reminders.map((reminder) => (
          <Link
            key={reminder.id}
            to={reminder.href}
            className="grid grid-cols-[1fr_repeat(3,_64px)_64px] border-b last:border-b-0 hover:bg-accent/50 transition-colors"
          >
            <div className="px-3 py-2.5 text-sm font-medium text-foreground flex items-center gap-2">
              {CATEGORY_LABELS[reminder.id] ?? reminder.label}
              {reminder.deltaFromYesterday !== 0 && (
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    reminder.deltaFromYesterday > 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-green-600 dark:text-green-400"
                  )}
                >
                  {reminder.deltaFromYesterday > 0 ? "+" : ""}
                  {reminder.deltaFromYesterday}
                </span>
              )}
            </div>
            {reminder.slaBands.map((band) => (
              <div
                key={`${reminder.id}-${band.label}`}
                className={cn(
                  "flex items-center justify-center py-2.5 text-sm font-semibold transition-colors",
                  HEAT_COLORS[getHeatLevel(band.count)]
                )}
              >
                {band.count}
              </div>
            ))}
            <div
              className={cn(
                "flex items-center justify-center py-2.5 text-sm font-bold",
                HEAT_COLORS[getHeatLevel(reminder.count)]
              )}
            >
              {reminder.count}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
