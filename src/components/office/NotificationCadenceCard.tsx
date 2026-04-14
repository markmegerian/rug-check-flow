import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { describeNotificationType, shouldThrottleCollectionsReminder, type NotificationType } from "@/lib/notification-cadence";

type NotificationCadenceCardProps = {
  clientId: string;
  enabled?: boolean;
};

type NotificationCadenceRow = {
  id: string;
  notification_type: NotificationType;
  scheduled_for: string;
  sent_at: string | null;
  throttle_key: string;
  entity_type: string;
  entity_id: string | null;
};

type NotificationThrottleRow = {
  throttle_key: string;
  last_sent_at: string;
};

async function fetchCadence(clientId: string) {
  const [cadenceResult, throttleResult] = await Promise.all([
    supabase
      .from("notification_cadence")
      .select("id, notification_type, scheduled_for, sent_at, throttle_key, entity_type, entity_id")
      .eq("client_id", clientId)
      .order("scheduled_for", { ascending: true })
      .limit(12),
    supabase
      .from("notification_throttles")
      .select("throttle_key, last_sent_at")
      .eq("client_id", clientId),
  ]);

  if (cadenceResult.error) throw cadenceResult.error;
  if (throttleResult.error) throw throttleResult.error;

  return {
    cadence: (cadenceResult.data ?? []) as NotificationCadenceRow[],
    throttles: (throttleResult.data ?? []) as NotificationThrottleRow[],
  };
}

export function NotificationCadenceCard({ clientId, enabled = true }: NotificationCadenceCardProps) {
  const cadenceQuery = useQuery({
    queryKey: ["notification-cadence", clientId],
    queryFn: () => fetchCadence(clientId),
    enabled: enabled && Boolean(clientId),
    staleTime: 30_000,
  });

  const throttleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of cadenceQuery.data?.throttles ?? []) map.set(row.throttle_key, row.last_sent_at);
    return map;
  }, [cadenceQuery.data?.throttles]);

  if (cadenceQuery.isLoading) {
    return <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">Loading reminder cadence…</div>;
  }

  if (cadenceQuery.isError || !cadenceQuery.data) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Reminder cadence unavailable for this client.</div>;
  }

  const rows = cadenceQuery.data.cadence;

  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Reminder cadence</h3>
        <p className="text-xs text-muted-foreground">Upcoming estimate and invoice follow-ups scheduled for this client.</p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No automated reminders are scheduled yet.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const throttled = row.throttle_key.startsWith("collections:")
              ? shouldThrottleCollectionsReminder({ latestThrottleAt: throttleMap.get(row.throttle_key), candidateScheduledFor: row.scheduled_for })
              : false;

            return (
              <div key={row.id} className="rounded-lg border border-border/70 bg-background/80 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium text-foreground">{describeNotificationType(row.notification_type)}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.entity_type}{row.entity_id ? ` · ${row.entity_id}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.sent_at ? <Badge variant="secondary">Sent</Badge> : <Badge variant="outline">Scheduled</Badge>}
                    {throttled ? <Badge variant="outline">Throttle hold</Badge> : null}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {row.sent_at
                    ? `Sent ${formatDistanceToNow(new Date(row.sent_at), { addSuffix: true })}`
                    : `Due ${formatDistanceToNow(new Date(row.scheduled_for), { addSuffix: true })}`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
