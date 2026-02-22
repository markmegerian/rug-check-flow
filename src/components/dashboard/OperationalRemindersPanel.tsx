import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { BellRing, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOperationalReminders, type OperationalReminder } from "@/hooks/useOperationalReminders";

const SEVERITY_STYLE: Record<OperationalReminder["severity"], string> = {
  default: "bg-muted text-muted-foreground",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

export function OperationalRemindersPanel() {
  const { loading, errorMessage, reminders, updates, refresh } = useOperationalReminders();

  return (
    <section className="rounded-xl border bg-card p-5 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Operational reminders & updates
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Live counts for stale workflows and recent client-side activity.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5" disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Partial data loaded: {errorMessage}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading operational reminders…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            {reminders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reminders available for your current scope.</p>
            ) : (
              reminders.map((reminder) => (
                <Link
                  key={reminder.id}
                  to={reminder.href}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{reminder.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{reminder.description}</p>
                  </div>
                  <Badge className={SEVERITY_STYLE[reminder.severity]} variant="secondary">
                    {reminder.count}
                  </Badge>
                </Link>
              ))
            )}
          </div>

          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <BellRing className="h-3.5 w-3.5" />
              Recent client updates
            </p>
            {updates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity in the last 7 days.</p>
            ) : (
              updates.map((update) => (
                <div key={update.id} className="rounded-md border bg-background px-2.5 py-2">
                  <p className="text-sm">{update.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatDistanceToNow(new Date(update.createdAt), { addSuffix: true })}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
