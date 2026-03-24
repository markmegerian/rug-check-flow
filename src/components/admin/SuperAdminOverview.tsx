import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, formatDistanceToNow } from "date-fns";
import { BellRing, Clock3, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/states/PageState";
import { InvoiceStatusBadge, RugStatusBadge } from "@/components/shared/StatusBadge";
import { OperationalRemindersPanel } from "@/components/dashboard/OperationalRemindersPanel";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";
import type { Tables } from "@/integrations/supabase/types";

type ClientResponseRow = ExtendedTableRow<"communication_events">;
type OverdueInvoiceRow = Pick<
  Tables<"invoices">,
  "id" | "invoice_number" | "due_at" | "created_at" | "status" | "total" | "client_id"
> & {
  clients: { name: string } | null;
};
type AttentionRugRow = Pick<
  Tables<"rugs">,
  "id" | "tag" | "status" | "checked_in_at" | "completed_at" | "notes" | "photo_url"
> & {
  clients: { name: string } | null;
};

type ClientResponseItem = {
  id: string;
  clientName: string;
  title: string;
  createdAt: string;
  tone: "success" | "danger" | "neutral";
};

type AttentionItem = {
  id: string;
  rugId: string;
  rugNumber: string;
  clientName: string;
  status: Tables<"rugs">["status"];
  photoUrl: string | null;
  ageDays: number;
  reason: string;
  checkedInAt: string;
};

type OverviewData = {
  clientResponses: ClientResponseItem[];
  overdueInvoices: OverdueInvoiceRow[];
  attentionItems: AttentionItem[];
  totals: {
    responses: number;
    overdueInvoices: number;
    overdueBalance: number;
    attentionRugs: number;
  };
};

const CLIENT_RESPONSE_EVENTS = [
  "estimate_approved_by_client",
  "estimate_rejected_by_client",
  "invoice_pdf_downloaded_by_client",
];
const STALE_RUG_DAYS = 7;

function responseTitle(event: ClientResponseRow) {
  if (event.event_type === "estimate_approved_by_client") return event.subject || "Estimate approved";
  if (event.event_type === "estimate_rejected_by_client") return event.subject || "Estimate rejected";
  if (event.event_type === "invoice_pdf_downloaded_by_client") return event.subject || "Invoice viewed";
  return event.subject || event.event_type;
}

function responseTone(eventType: string): ClientResponseItem["tone"] {
  if (eventType === "estimate_approved_by_client") return "success";
  if (eventType === "estimate_rejected_by_client") return "danger";
  return "neutral";
}

function attentionReason(rug: AttentionRugRow, ageDays: number) {
  const noteFlag = rug.notes.trim().length > 0;
  if (rug.status === "ready" && ageDays >= STALE_RUG_DAYS) {
    return noteFlag ? `Ready ${ageDays}d · note attached` : `Ready ${ageDays}d — verify route / delivery`;
  }
  if (rug.status === "in_production" && ageDays >= STALE_RUG_DAYS) {
    return noteFlag ? `In production ${ageDays}d · note attached` : `In production ${ageDays}d — review delay`;
  }
  if (rug.status === "checked_in" && ageDays >= STALE_RUG_DAYS) {
    return noteFlag ? `Checked in ${ageDays}d · note attached` : `Checked in ${ageDays}d — confirm progression`;
  }
  if (rug.status === "picked_up" && ageDays >= STALE_RUG_DAYS) {
    return noteFlag ? `Picked up ${ageDays}d · note attached` : `Picked up ${ageDays}d — verify intake`;
  }
  if (noteFlag) return "Special note attached";
  return "Needs review";
}

function attentionPriority(item: AttentionItem) {
  const statusRank: Record<AttentionItem["status"], number> = {
    ready: 4,
    in_production: 3,
    checked_in: 2,
    picked_up: 1,
  };
  return item.ageDays * 10 + statusRank[item.status];
}

async function fetchOverviewData(): Promise<OverviewData> {
  const [responsesResult, overdueResult, rugsResult] = await Promise.all([
    supabaseExtended
      .from("communication_events")
      .select("id, client_id, event_type, subject, created_at")
      .in("event_type", CLIENT_RESPONSE_EVENTS)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("invoices")
      .select("id, invoice_number, due_at, created_at, status, total, client_id, clients(name)")
      .eq("status", "overdue")
      .order("due_at", { ascending: true, nullsFirst: true })
      .limit(20),
    supabase
      .from("rugs")
      .select("id, tag, status, checked_in_at, completed_at, notes, photo_url, clients(name)")
      .order("checked_in_at", { ascending: true })
      .limit(250),
  ]);

  if (responsesResult.error) throw responsesResult.error;
  if (overdueResult.error) throw overdueResult.error;
  if (rugsResult.error) throw rugsResult.error;

  const responseRows = (responsesResult.data ?? []) as ClientResponseRow[];
  const responseClientIds = Array.from(new Set(responseRows.map((row) => row.client_id).filter((value): value is string => Boolean(value))));
  let clientNameMap = new Map<string, string>();

  if (responseClientIds.length > 0) {
    const { data: clientRows, error: clientError } = await supabase
      .from("clients")
      .select("id, name")
      .in("id", responseClientIds);
    if (clientError) throw clientError;
    clientNameMap = new Map(((clientRows ?? []) as Array<Pick<Tables<"clients">, "id" | "name">>).map((row) => [row.id, row.name]));
  }

  const clientResponses: ClientResponseItem[] = responseRows.slice(0, 8).map((row) => ({
    id: row.id,
    clientName: row.client_id ? clientNameMap.get(row.client_id) ?? "Unknown client" : "Unknown client",
    title: responseTitle(row),
    createdAt: row.created_at,
    tone: responseTone(row.event_type),
  }));

  const overdueInvoices = (overdueResult.data ?? []) as unknown as OverdueInvoiceRow[];
  const overdueBalance = overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);

  const attentionItems = ((rugsResult.data ?? []) as unknown as AttentionRugRow[])
    .map((rug) => {
      const ageDays = Math.max(0, differenceInCalendarDays(new Date(), new Date(rug.checked_in_at)));
      const noteFlag = rug.notes.trim().length > 0;
      const staleFlag = ageDays >= STALE_RUG_DAYS;
      if (!staleFlag && !noteFlag) return null;
      return {
        id: rug.id,
        rugId: rug.id,
        rugNumber: rug.tag,
        clientName: rug.clients?.name ?? "Unknown client",
        status: rug.status,
        photoUrl: rug.photo_url,
        ageDays,
        reason: attentionReason(rug, ageDays),
        checkedInAt: rug.checked_in_at,
      } satisfies AttentionItem;
    })
    .filter((item): item is AttentionItem => Boolean(item))
    .sort((a, b) => attentionPriority(b) - attentionPriority(a))
    .slice(0, 10);

  return {
    clientResponses,
    overdueInvoices: overdueInvoices.slice(0, 10),
    attentionItems,
    totals: {
      responses: clientResponses.length,
      overdueInvoices: overdueInvoices.length,
      overdueBalance,
      attentionRugs: attentionItems.length,
    },
  };
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function SuperAdminOverview({ onOpenRug }: { onOpenRug: (rugId: string) => void }) {
  const navigate = useNavigate();
  const overviewQuery = useQuery({
    queryKey: ["super-admin-overview"],
    queryFn: fetchOverviewData,
    staleTime: 60_000,
  });

  const data = overviewQuery.data;

  const totalCards = useMemo(() => [
    {
      label: "Client responses",
      value: data?.totals.responses ?? 0,
      subtext: "Recent estimate decisions + client invoice views",
      icon: BellRing,
    },
    {
      label: "Overdue invoices",
      value: data?.totals.overdueInvoices ?? 0,
      subtext: `$${(data?.totals.overdueBalance ?? 0).toFixed(2)} open overdue balance`,
      icon: Clock3,
    },
    {
      label: "Rugs needing attention",
      value: data?.totals.attentionRugs ?? 0,
      subtext: `Stale rugs + note-flagged rugs (${STALE_RUG_DAYS}d rule)`,
      icon: TriangleAlert,
    },
  ], [data]);

  if (overviewQuery.isLoading) {
    return (
      <div className="app-page flex h-full items-center justify-center">
        <LoadingState title="Loading super admin overview" description="Building your control center..." />
      </div>
    );
  }

  if (overviewQuery.isError || !data) {
    return (
      <div className="app-page h-full overflow-auto p-4 md:p-6">
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load super admin overview: {overviewQuery.error instanceof Error ? overviewQuery.error.message : "Unknown error"}
        </div>
      </div>
    );
  }

  return (
    <div className="app-page h-full overflow-auto space-y-5 animate-fade-in-up">
      <section className="grid gap-3 md:grid-cols-3">
        {totalCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{card.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{card.value}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{card.subtext}</p>
                </div>
                <div className="rounded-xl bg-muted/60 p-2">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm xl:col-span-1">
          <SectionHeader
            title="Client responses"
            description="Recent portal actions that may change workflow or billing."
            action={
              <Button variant="outline" size="sm" onClick={() => navigate("/ops?tab=estimates")}>Open estimates</Button>
            }
          />
          <div className="mt-4 space-y-3">
            {data.clientResponses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent client responses.</p>
            ) : data.clientResponses.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/70 bg-background/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.clientName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.title}</p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={item.tone === "success" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : item.tone === "danger" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" : ""}
                  >
                    {item.tone === "success" ? "Approved" : item.tone === "danger" ? "Rejected" : "Viewed"}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm xl:col-span-1">
          <SectionHeader
            title="Overdue invoices"
            description="Collections queue for balances already marked overdue."
            action={
              <Button variant="outline" size="sm" onClick={() => navigate("/ops?tab=invoices&status=overdue")}>Open receivables</Button>
            }
          />
          <div className="mt-4 space-y-3">
            {data.overdueInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No overdue invoices right now.</p>
            ) : data.overdueInvoices.map((invoice) => {
              const dueBase = invoice.due_at ?? invoice.created_at;
              const ageDays = Math.max(0, differenceInCalendarDays(new Date(), new Date(dueBase)));
              return (
                <div key={invoice.id} className="rounded-xl border border-border/70 bg-background/80 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{invoice.clients?.name ?? "Unknown client"}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{invoice.invoice_number} · ${Number(invoice.total ?? 0).toFixed(2)}</p>
                    </div>
                    <InvoiceStatusBadge status={invoice.status} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {invoice.due_at ? `Due ${formatDistanceToNow(new Date(invoice.due_at), { addSuffix: true })}` : `Created ${formatDistanceToNow(new Date(invoice.created_at), { addSuffix: true })}`} · {ageDays} day{ageDays === 1 ? "" : "s"} late
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm xl:col-span-1">
          <SectionHeader
            title="Rugs needing attention"
            description="Combined stale-rug and note-flag queue until first-class exceptions land."
            action={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate("/ops?tab=jobs")}>Open jobs</Button>
                <Button variant="outline" size="icon" onClick={() => void overviewQuery.refetch()}>
                  <RefreshCw className={`h-4 w-4 ${overviewQuery.isFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
            }
          />
          <div className="mt-4 space-y-3">
            {data.attentionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stale or note-flagged rugs currently need review.</p>
            ) : data.attentionItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-border/70 bg-background/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{item.rugNumber}</span>
                      <RugStatusBadge status={item.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.clientName}</p>
                    <p className="mt-1 text-sm text-foreground">{item.reason}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Checked in {formatDistanceToNow(new Date(item.checkedInAt), { addSuffix: true })}</p>
                  </div>
                  <div className="flex shrink-0 items-start gap-2">
                    {item.photoUrl ? <img src={item.photoUrl} alt={`Rug ${item.rugNumber}`} className="h-16 w-16 rounded-lg border object-cover" /> : null}
                    <Button size="sm" variant="outline" onClick={() => onOpenRug(item.rugId)}>Open rug</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <OperationalRemindersPanel />
    </div>
  );
}
