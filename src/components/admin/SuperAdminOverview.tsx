import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { BellRing, Clock3, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/states/PageState";
import { InvoiceStatusBadge, RugStatusBadge } from "@/components/shared/StatusBadge";
import { OperationalRemindersPanel } from "@/components/dashboard/OperationalRemindersPanel";
import { STALE_RUG_DAYS, useSuperAdminQueues } from "@/hooks/useSuperAdminQueues";

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

export function SuperAdminOverview({
  onOpenRug,
  onSelectTab,
}: {
  onOpenRug: (rugId: string) => void;
  onSelectTab: (tab: "responses" | "collections" | "attention") => void;
}) {
  const overviewQuery = useSuperAdminQueues();
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
      label: "Attention items",
      value: data?.totals.attentionRugs ?? 0,
      subtext: `Route exceptions + stale rugs (${STALE_RUG_DAYS}d stale rule)`,
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
            action={<Button variant="outline" size="sm" onClick={() => onSelectTab("responses")}>Open queue</Button>}
          />
          <div className="mt-4 space-y-3">
            {data.clientResponses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent client responses.</p>
            ) : data.clientResponses.slice(0, 6).map((item) => (
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
                <p className="mt-2 text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm xl:col-span-1">
          <SectionHeader
            title="Overdue invoices"
            description="Collections queue for balances already marked overdue."
            action={<Button variant="outline" size="sm" onClick={() => onSelectTab("collections")}>Open queue</Button>}
          />
          <div className="mt-4 space-y-3">
            {data.overdueInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground">No overdue invoices right now.</p>
            ) : data.overdueInvoices.slice(0, 6).map((invoice) => (
              <div key={invoice.id} className="rounded-xl border border-border/70 bg-background/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{invoice.clients?.name ?? "Unknown client"}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{invoice.invoice_number} · ${Number(invoice.total ?? 0).toFixed(2)}</p>
                  </div>
                  <InvoiceStatusBadge status={invoice.status} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {invoice.due_at ? `Due ${formatDistanceToNow(new Date(invoice.due_at), { addSuffix: true })}` : `Created ${formatDistanceToNow(new Date(invoice.created_at), { addSuffix: true })}`}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm xl:col-span-1">
          <SectionHeader
            title="Attention queue"
            description="Route exceptions first, then stale and note-flagged rugs."
            action={<Button variant="outline" size="sm" onClick={() => onSelectTab("attention")}>Open queue</Button>}
          />
          <div className="mt-4 space-y-3">
            {data.attentionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No route exceptions or stale rugs currently need review.</p>
            ) : data.attentionItems.slice(0, 6).map((item) => (
              <div key={item.id} className="rounded-xl border border-border/70 bg-background/80 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{item.rugNumber}</span>
                      <Badge variant="secondary">{item.kind === "route_exception" ? "Exception" : item.kind === "reentry_event" ? "Re-entry" : "Stale rug"}</Badge>
                      {item.status ? <RugStatusBadge status={item.status} /> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.clientName}</p>
                    <p className="mt-1 text-sm text-foreground">{item.reason}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onOpenRug(item.rugId)}>Open rug</Button>
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
