import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/states/PageState";
import { RugStatusBadge } from "@/components/shared/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";
import type { Tables } from "@/integrations/supabase/types";
import { RUG_RETURN_EVENT_TYPES } from "@/hooks/useRugReturnEvents";

type ReturnEventRow = Pick<
  ExtendedTableRow<"communication_events">,
  "id" | "client_id" | "rug_id" | "event_type" | "subject" | "body" | "created_at"
>;

type RugLookup = Pick<Tables<"rugs">, "id" | "tag" | "status" | "photo_url">;
type ClientLookup = Pick<Tables<"clients">, "id" | "name">;

type ReturnQueueItem = {
  rugId: string;
  rugNumber: string;
  clientName: string;
  rugStatus: Tables<"rugs">["status"] | null;
  photoUrl: string | null;
  category: "immediate_return" | "reentry";
  state: "open" | "resolved";
  eventAt: string;
  summary: string;
  resolution: string | null;
};

async function fetchReturnQueue(): Promise<ReturnQueueItem[]> {
  const { data: eventRows, error: eventError } = await supabaseExtended
    .from("communication_events")
    .select("id, client_id, rug_id, event_type, subject, body, created_at")
    .in("event_type", [...RUG_RETURN_EVENT_TYPES])
    .order("created_at", { ascending: false })
    .limit(300);

  if (eventError) throw eventError;

  const rows = (eventRows ?? []) as ReturnEventRow[];
  const rugIds = Array.from(new Set(rows.map((row) => row.rug_id).filter((value): value is string => Boolean(value))));
  const clientIds = Array.from(new Set(rows.map((row) => row.client_id).filter((value): value is string => Boolean(value))));

  let rugMap = new Map<string, RugLookup>();
  let clientMap = new Map<string, string>();

  if (rugIds.length > 0) {
    const { data: rugs, error: rugError } = await supabase
      .from("rugs")
      .select("id, tag, status, photo_url")
      .in("id", rugIds);
    if (rugError) throw rugError;
    rugMap = new Map(((rugs ?? []) as RugLookup[]).map((rug) => [rug.id, rug]));
  }

  if (clientIds.length > 0) {
    const { data: clients, error: clientError } = await supabase
      .from("clients")
      .select("id, name")
      .in("id", clientIds);
    if (clientError) throw clientError;
    clientMap = new Map(((clients ?? []) as ClientLookup[]).map((client) => [client.id, client.name]));
  }

  const grouped = new Map<string, ReturnEventRow[]>();
  for (const row of rows) {
    if (!row.rug_id) continue;
    const current = grouped.get(row.rug_id) ?? [];
    current.push(row);
    grouped.set(row.rug_id, current);
  }

  const items: ReturnQueueItem[] = [];
  for (const [rugId, events] of grouped.entries()) {
    const latest = events[0];
    const latestReturn = events.find((event) => event.event_type !== "rug_return_resolved");
    const latestResolved = events.find((event) => event.event_type === "rug_return_resolved");
    const rug = rugMap.get(rugId) ?? null;
    const clientName = latest.client_id ? clientMap.get(latest.client_id) ?? "Unknown client" : "Unknown client";
    const activeEvent = latestReturn ?? latest;
    const state: ReturnQueueItem["state"] = latest.event_type === "rug_return_resolved" ? "resolved" : "open";
    const category: ReturnQueueItem["category"] = activeEvent.event_type === "rug_immediate_return_logged" ? "immediate_return" : "reentry";
    items.push({
      rugId,
      rugNumber: rug?.tag ?? activeEvent.subject,
      clientName,
      rugStatus: rug?.status ?? null,
      photoUrl: rug?.photo_url ?? null,
      category,
      state,
      eventAt: activeEvent.created_at,
      summary: activeEvent.body || activeEvent.subject,
      resolution: latestResolved?.body ?? null,
    });
  }

  return items.sort((a, b) => Date.parse(b.eventAt) - Date.parse(a.eventAt));
}

export function ReturnsTab({ onOpenRug }: { onOpenRug: (rugId: string) => void }) {
  const query = useQuery({
    queryKey: ["admin-return-queue"],
    queryFn: fetchReturnQueue,
    staleTime: 30_000,
  });

  const counts = useMemo(() => ({
    open: query.data?.filter((item) => item.state === "open").length ?? 0,
    resolved: query.data?.filter((item) => item.state === "resolved").length ?? 0,
  }), [query.data]);

  if (query.isLoading) {
    return (
      <div className="app-page flex h-full items-center justify-center">
        <LoadingState title="Loading returns" description="Gathering return and re-entry history..." />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <div className="app-page p-4 text-sm text-destructive">Failed to load returns and re-entry events.</div>;
  }

  return (
    <div className="app-page h-full overflow-auto space-y-4 animate-fade-in-up">
      <div className="app-section-header">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Returns & Re-entry</h2>
          <p className="text-sm text-muted-foreground">Admin review for open and resolved return / re-entry work.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{counts.open} open</Badge>
          <Badge variant="secondary">{counts.resolved} resolved</Badge>
        </div>
      </div>

      {query.data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/70 p-8 text-center text-muted-foreground">
          No return or re-entry events yet.
        </div>
      ) : (
        query.data.map((item) => (
          <div key={`${item.rugId}-${item.eventAt}`} className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">{item.rugNumber}</span>
                  <Badge className={item.category === "immediate_return" ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200"}>
                    {item.category === "immediate_return" ? "Immediate return" : "Re-entry"}
                  </Badge>
                  <Badge variant="secondary" className={item.state === "open" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"}>
                    {item.state === "open" ? "Open" : "Resolved"}
                  </Badge>
                  {item.rugStatus ? <RugStatusBadge status={item.rugStatus} /> : null}
                </div>
                <p className="text-sm text-muted-foreground">{item.clientName}</p>
                <p className="text-sm text-foreground whitespace-pre-line">{item.summary}</p>
                {item.resolution ? (
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground whitespace-pre-line">
                    <span className="font-medium text-foreground">Resolution</span>
                    <div className="mt-1">{item.resolution}</div>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">Logged {formatDistanceToNow(new Date(item.eventAt), { addSuffix: true })}</p>
              </div>
              <div className="flex items-start gap-3">
                {item.photoUrl ? <img src={item.photoUrl} alt={`Rug ${item.rugNumber}`} className="h-16 w-16 rounded-lg border object-cover" /> : null}
                <Button size="sm" variant="outline" onClick={() => onOpenRug(item.rugId)}>Open rug</Button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
