import { differenceInCalendarDays, formatDistanceToNow } from "date-fns";
import { LoadingState } from "@/components/states/PageState";
import { InvoiceStatusBadge } from "@/components/shared/StatusBadge";
import { useSuperAdminQueues } from "@/hooks/useSuperAdminQueues";

export function CollectionsTab() {
  const query = useSuperAdminQueues();

  if (query.isLoading) {
    return (
      <div className="app-page flex h-full items-center justify-center">
        <LoadingState title="Loading collections" description="Gathering overdue balances..." />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <div className="app-page p-4 text-sm text-destructive">Failed to load overdue invoices.</div>;
  }

  return (
    <div className="app-page h-full overflow-auto space-y-4 animate-fade-in-up">
      <div className="app-section-header">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Overdue Invoices</h2>
          <p className="text-sm text-muted-foreground">${query.data.totals.overdueBalance.toFixed(2)} total overdue across {query.data.totals.overdueInvoices} invoice(s).</p>
        </div>
      </div>
      {query.data.overdueInvoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/70 p-8 text-center text-muted-foreground">No overdue invoices right now.</div>
      ) : query.data.overdueInvoices.map((invoice) => {
        const dueBase = invoice.due_at ?? invoice.created_at;
        const ageDays = Math.max(0, differenceInCalendarDays(new Date(), new Date(dueBase)));
        return (
          <div key={invoice.id} className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{invoice.clients?.name ?? "Unknown client"}</p>
                <p className="mt-1 text-sm text-muted-foreground">{invoice.invoice_number} · ${Number(invoice.total ?? 0).toFixed(2)}</p>
              </div>
              <InvoiceStatusBadge status={invoice.status} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{invoice.due_at ? `Due ${formatDistanceToNow(new Date(invoice.due_at), { addSuffix: true })}` : `Created ${formatDistanceToNow(new Date(invoice.created_at), { addSuffix: true })}`} · {ageDays} day{ageDays === 1 ? "" : "s"} late</p>
          </div>
        );
      })}
    </div>
  );
}
