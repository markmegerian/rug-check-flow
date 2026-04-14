import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Package, Truck, ClipboardCheck, DollarSign, MessageSquare, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";

type ActivityEvent = {
  id: string;
  type: "rug" | "invoice" | "estimate" | "pickup" | "communication";
  title: string;
  description: string;
  timestamp: string;
  status?: string;
};

const EVENT_ICONS: Record<ActivityEvent["type"], typeof Package> = {
  rug: Package,
  invoice: DollarSign,
  estimate: ClipboardCheck,
  pickup: Truck,
  communication: MessageSquare,
};

const EVENT_COLORS: Record<ActivityEvent["type"], string> = {
  rug: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  invoice: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  estimate: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  pickup: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  communication: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatEventType(eventType: string): string {
  return eventType.split("_").map(capitalize).join(" ");
}

interface ClientActivityFeedProps {
  clientId: string;
  enabled?: boolean;
}

export function ClientActivityFeed({ clientId, enabled = true }: ClientActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId || !enabled) {
      setEvents([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchActivity = async () => {
      setLoading(true);
      setError(null);
      const allEvents: ActivityEvent[] = [];

      // Run all queries in parallel
      const [rugsResult, invoicesResult, estimatesResult, pickupsResult, commsResult] = await Promise.allSettled([
        supabase
          .from("rugs")
          .select("id, tag, status, checked_in_at")
          .eq("client_id", clientId)
          .order("checked_in_at", { ascending: false })
          .limit(10),
        supabaseExtended
          .from("invoices")
          .select("id, invoice_number, status, total, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabaseExtended
          .from("estimates")
          .select("id, estimate_number, status, total, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabaseExtended
          .from("pickup_requests")
          .select("id, scheduled_date, status, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(10),
        supabaseExtended
          .from("communication_events")
          .select("id, event_type, subject, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (cancelled) return;

      // Process rugs
      if (rugsResult.status === "fulfilled" && !rugsResult.value.error) {
        for (const rug of rugsResult.value.data ?? []) {
          allEvents.push({
            id: `rug-${rug.id}`,
            type: "rug",
            title: `Rug ${rug.tag} checked in`,
            description: `Status: ${rug.status}`,
            timestamp: rug.checked_in_at,
            status: rug.status,
          });
        }
      }

      // Process invoices
      if (invoicesResult.status === "fulfilled" && !invoicesResult.value.error) {
        for (const inv of (invoicesResult.value.data ?? []) as Array<{ id: string; invoice_number: string; status: string; total: number; created_at: string }>) {
          allEvents.push({
            id: `inv-${inv.id}`,
            type: "invoice",
            title: `Invoice ${inv.invoice_number}`,
            description: `$${Number(inv.total).toFixed(2)} — ${inv.status}`,
            timestamp: inv.created_at,
            status: inv.status,
          });
        }
      }

      // Process estimates
      if (estimatesResult.status === "fulfilled" && !estimatesResult.value.error) {
        for (const est of (estimatesResult.value.data ?? []) as Array<{ id: string; estimate_number: string; status: string; total: number; created_at: string }>) {
          allEvents.push({
            id: `est-${est.id}`,
            type: "estimate",
            title: `Estimate ${est.estimate_number}`,
            description: `$${Number(est.total).toFixed(2)} — ${est.status}`,
            timestamp: est.created_at,
            status: est.status,
          });
        }
      }

      // Process pickups
      if (pickupsResult.status === "fulfilled" && !pickupsResult.value.error) {
        for (const pk of (pickupsResult.value.data ?? []) as Array<{ id: string; scheduled_date: string; status: string; created_at: string }>) {
          allEvents.push({
            id: `pk-${pk.id}`,
            type: "pickup",
            title: `Pickup ${pk.status}`,
            description: `Scheduled: ${pk.scheduled_date}`,
            timestamp: pk.created_at,
            status: pk.status,
          });
        }
      }

      // Process communications
      if (commsResult.status === "fulfilled" && !commsResult.value.error) {
        for (const comm of (commsResult.value.data ?? []) as Array<{ id: string; event_type: string; subject: string; created_at: string }>) {
          allEvents.push({
            id: `comm-${comm.id}`,
            type: "communication",
            title: comm.subject || formatEventType(comm.event_type),
            description: formatEventType(comm.event_type),
            timestamp: comm.created_at,
          });
        }
      }

      // Check if we got nothing from any source
      const allFailed = [rugsResult, invoicesResult, estimatesResult, pickupsResult, commsResult]
        .every((r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.error));

      if (allFailed) {
        setError("Unable to load activity data.");
      }

      // Sort by timestamp descending
      allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setEvents(allEvents.slice(0, 20));
      setLoading(false);
    };

    fetchActivity();
    return () => { cancelled = true; };
  }, [clientId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-2">Loading activity...</p>;
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive py-2">
        <AlertCircle className="h-3.5 w-3.5" />
        {error}
      </div>
    );
  }

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground py-2">No activity found.</p>;
  }

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        Activity Timeline
      </h4>
      <div className="relative pl-6 space-y-2.5">
        <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border" />

        {events.map((event) => {
          const Icon = EVENT_ICONS[event.type];
          return (
            <div key={event.id} className="relative">
              <div className={`absolute left-[-15px] top-1 h-5 w-5 rounded-full flex items-center justify-center ${EVENT_COLORS[event.type]}`}>
                <Icon className="h-3 w-3" />
              </div>
              <div className="ml-3 pb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{event.title}</span>
                  {event.status && (
                    <Badge variant="outline" className="text-[10px] h-4">
                      {event.status}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{event.description}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
