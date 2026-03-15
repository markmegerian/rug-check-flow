import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { BellRing, RefreshCw, Send, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useOperationalReminders,
  type OperationalReminder,
  type OperationalTrendSnapshot,
} from "@/hooks/useOperationalReminders";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const SEVERITY_STYLE: Record<OperationalReminder["severity"], string> = {
  default: "bg-muted text-muted-foreground",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

const SLA_BAND_STYLE: Record<string, string> = {
  default: "bg-muted text-muted-foreground",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

function TrendDelta({ trend }: { trend: OperationalTrendSnapshot }) {
  if (trend.delta > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-300">
        <TrendingUp className="h-3 w-3" /> +{trend.delta} vs yesterday
      </span>
    );
  }
  if (trend.delta < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-300">
        <TrendingDown className="h-3 w-3" /> {trend.delta} vs yesterday
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">No change vs yesterday</span>;
}

export function OperationalRemindersPanel() {
  const { toast } = useToast();
  const { roles } = useAuth();
  const { loading, errorMessage, reminders, updates, trends, refresh } = useOperationalReminders();
  const [sendingAlerts, setSendingAlerts] = useState(false);
  const alertsEnabled = import.meta.env.VITE_ENABLE_OPERATIONAL_ALERTS === "true";
  const canSendAlerts = alertsEnabled && (roles.includes("admin") || roles.includes("office"));

  const sendCriticalAlerts = async () => {
    if (!canSendAlerts) return;
    setSendingAlerts(true);
    type AlertResponse = {
      success?: boolean;
      should_alert?: boolean;
      dry_run?: boolean;
      critical_counts?: { estimates_7d: number; pickups_7d: number; overdue_invoices_7d: number };
      slack?: { attempted: boolean; sent: boolean; message?: string };
      email?: { attempted: boolean; sent: boolean; message?: string };
      error?: string;
    };
    const { data, error } = await supabase.functions.invoke<AlertResponse>("operational-alerts", {
      body: { dry_run: false },
    });
    setSendingAlerts(false);

    if (error || data?.error || !data?.success) {
      toast({
        title: "Alert dispatch failed",
        description: data?.error ?? error?.message ?? "Unknown error",
        variant: "destructive",
      });
      return;
    }

    if (!data.should_alert) {
      toast({ title: "No critical alerts", description: "No 7+ day critical reminders currently require notifications." });
      return;
    }

    toast({
      title: "Critical alerts dispatched",
      description: `Slack: ${data.slack?.sent ? "sent" : "not sent"} · Email: ${data.email?.sent ? "sent" : "not sent"}`,
    });
  };

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
        <div className="flex items-center gap-2">
          {canSendAlerts ? (
            <Button
              variant="outline"
              size="sm"
              onClick={sendCriticalAlerts}
              className="gap-1.5"
              disabled={loading || sendingAlerts}
            >
              <Send className={`h-3.5 w-3.5 ${sendingAlerts ? "animate-pulse" : ""}`} />
              {sendingAlerts ? "Sending alerts..." : "Send critical alerts"}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5" disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Partial data loaded: {errorMessage}
        </div>
      ) : null}

      {trends.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {trends.map((trend) => (
            <div key={trend.id} className="rounded-md border bg-background px-3 py-2.5 space-y-1">
              <p className="text-xs text-muted-foreground">{trend.label}</p>
              <p className="text-sm font-semibold">{trend.current}</p>
              <TrendDelta trend={trend} />
            </div>
          ))}
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
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {reminder.slaBands.map((band) => (
                        <Badge
                          key={`${reminder.id}-${band.label}`}
                          variant="secondary"
                          className={SLA_BAND_STYLE[band.tone]}
                        >
                          {band.label}: {band.count}
                        </Badge>
                      ))}
                      <span className="text-[11px] text-muted-foreground">
                        {reminder.deltaFromYesterday > 0
                          ? `+${reminder.deltaFromYesterday} vs yesterday`
                          : `${reminder.deltaFromYesterday} vs yesterday`}
                      </span>
                    </div>
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
