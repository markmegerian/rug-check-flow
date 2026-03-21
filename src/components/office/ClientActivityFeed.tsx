import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { FileText, Package, Truck, ClipboardCheck, DollarSign, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";

type ActivityEvent = {
  id: string;
  type: "rug_checkin" | "rug_status" | "invoice" | "estimate" | "pickup" | "communication";
  title: string;
  description: string;
  timestamp: string;
  status?: string;
};

const EVENT_ICONS = {
  rug_checkin: Package,
  rug_status: Package,
  invoice: DollarSign,
  estimate: ClipboardCheck,
  pickup: Truck,
  communication: MessageSquare,
};

const EVENT_COLORS = {
  rug_checkin: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  rug_status: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  invoice: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  estimate: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  pickup: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  communication: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

interface ClientActivityFeedProps {
  clientId: string;
}

export function ClientActivityFeed({ clientId }: ClientActivityFeedProps) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;

    const fetchActivity = async () => {
      setLoading(true);
      const allEvents: ActivityEvent[] = [];

      // Fetch recent rugs
      const { data: rugs } = await supabase
        .from("rugs")
        .select("id, tag, status, checked_in_at")
        .eq("client_id", clientId)
        .order("checked_in_at", { ascending: false })
        .limit(10);

      for (const rug of rugs ?? []) {
        allEvents.push({
          id: `rug-${rug.id}`,
          type: "rug_checkin",
          title: `Rug ${rug.tag} checked in`,
          description: `Status: ${rug.status}`,
          timestamp: rug.checked_in_at,
          status: rug.status,
        });
      }

      // Fetch recent invoices
      const { data: invoices } = await supabaseExtended
        .from("invoices")
        .select("id, invoice_number, status, total, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(10);

      for (const inv of invoices ?? []) {
        allEvents.push({
          id: `inv-${inv.id}`,
          type: "invoice",
          title: `Invoice ${inv.invoice_number}`,
          description: `$${Number(inv.total).toFixed(2)} — ${inv.status}`,
          timestamp: inv.created_at,
          status: inv.status,
        });
      }

      // Fetch recent estimates
      const { data: estimates } = await supabaseExtended
        .from("estimates")
        .select("id, estimate_number, status, total, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(10);

      for (const est of estimates ?? []) {
        allEvents.push({
          id: `est-${est.id}`,
          type: "estimate",
          title: `Estimate ${est.estimate_number}`,
          description: `$${Number(est.total).toFixed(2)} — ${est.status}`,
          timestamp: est.created_at,
          status: est.status,
        });
      }

      // Fetch recent pickup requests
      const { data: pickups } = await supabaseExtended
        .from("pickup_requests")
        .select("id, scheduled_date, status, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(10);

      for (const pk of pickups ?? []) {
        allEvents.push({
          id: `pk-${pk.id}`,
          type: "pickup",
          title: `Pickup ${pk.status}`,
          description: `Scheduled: ${pk.scheduled_date}`,
          timestamp: pk.created_at,
          status: pk.status,
        });
      }

      // Fetch recent communication events
      const { data: comms } = await supabaseExtended
        .from("communication_events")
        .select("id, event_type, subject, created_at")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(10);

      for (const comm of comms ?? []) {
        allEvents.push({
          id: `comm-${comm.id}`,
          type: "communication",
          title: comm.subject || comm.event_type,
          description: comm.event_type.replace(/_/g, " "),
          timestamp: comm.created_at,
        });
      }

      // Sort by timestamp descending
      allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setEvents(allEvents.slice(0, 25));
      setLoading(false);
    };

    fetchActivity();
  }, [clientId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">Loading activity...</p>;
  }

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No activity found for this client.</p>;
  }

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        Activity Timeline
      </h4>
      <div className="relative pl-6 space-y-3">
        {/* Vertical line */}
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
