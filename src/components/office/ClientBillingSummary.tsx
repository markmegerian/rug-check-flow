import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, formatDistanceToNow } from "date-fns";
import { LoadingState } from "@/components/states/PageState";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";
import {
  COLLECTION_ACTION_META,
  COLLECTION_ACTION_TYPES,
  formatInvoiceTermsLabel,
  formatReminderPreferenceLabel,
  type BillingReminderPreference,
  type CollectionsActionType,
} from "@/lib/billing";

type InvoiceSnapshot = {
  id: string;
  status: string;
  total: number | null;
  due_at: string | null;
  created_at: string;
};

type CollectionsActionEvent = Pick<
  ExtendedTableRow<"communication_events">,
  "id" | "event_type" | "subject" | "body" | "created_at"
>;

type ClientBillingSummaryProps = {
  clientId: string;
  invoiceTermsDays: number;
  billingReminderPreference: BillingReminderPreference;
  billingNotes: string;
};

type BillingSummaryData = {
  openBalance: number;
  overdueBalance: number;
  openInvoices: number;
  overdueInvoices: number;
  oldestOverdueAgeDays: number | null;
  latestCollectionsAction: CollectionsActionEvent | null;
};

function getCollectionsStateTone(eventType: string | null) {
  if (eventType === "collections_account_on_hold") return "bg-muted text-muted-foreground";
  if (eventType === "collections_account_disputed") return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  if (eventType === "collections_account_handled") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
  if (eventType === "collections_reminder_sent") return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200";
  return "bg-muted text-muted-foreground";
}

async function fetchBillingSummary(clientId: string): Promise<BillingSummaryData> {
  const [invoiceResult, actionsResult] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, status, total, due_at, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false }),
    supabaseExtended
      .from("communication_events")
      .select("id, event_type, subject, body, created_at")
      .eq("client_id", clientId)
      .in("event_type", [...COLLECTION_ACTION_TYPES])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (invoiceResult.error) throw invoiceResult.error;
  if (actionsResult.error) throw actionsResult.error;

  const invoices = (invoiceResult.data ?? []) as InvoiceSnapshot[];
  const actions = (actionsResult.data ?? []) as CollectionsActionEvent[];

  const openInvoices = invoices.filter((invoice) => ["sent", "overdue"].includes(invoice.status));
  const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue");
  const oldestOverdueAgeDays = overdueInvoices.length > 0
    ? Math.max(
        ...overdueInvoices.map((invoice) => {
          const dueBase = invoice.due_at ?? invoice.created_at;
          return Math.max(0, differenceInCalendarDays(new Date(), new Date(dueBase)));
        }),
      )
    : null;

  return {
    openBalance: openInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0),
    overdueBalance: overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0),
    openInvoices: openInvoices.length,
    overdueInvoices: overdueInvoices.length,
    oldestOverdueAgeDays,
    latestCollectionsAction: actions[0] ?? null,
  };
}

export function ClientBillingSummary({
  clientId,
  invoiceTermsDays,
  billingReminderPreference,
  billingNotes,
}: ClientBillingSummaryProps) {
  const summaryQuery = useQuery({
    queryKey: ["client-billing-summary", clientId],
    queryFn: () => fetchBillingSummary(clientId),
    enabled: Boolean(clientId),
    staleTime: 30_000,
  });

  const collectionsLabel = useMemo(() => {
    const eventType = summaryQuery.data?.latestCollectionsAction?.event_type as CollectionsActionType | undefined;
    if (!eventType) return "No collections status logged";
    return COLLECTION_ACTION_META[eventType]?.label ?? eventType;
  }, [summaryQuery.data?.latestCollectionsAction?.event_type]);

  if (summaryQuery.isLoading) {
    return (
      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
        <LoadingState title="Loading billing summary" description="Gathering account-level balance and collections context..." />
      </div>
    );
  }

  if (summaryQuery.isError || !summaryQuery.data) {
    return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Billing summary unavailable for this client.</div>;
  }

  const summary = summaryQuery.data;

  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Account billing summary</h3>
          <p className="text-xs text-muted-foreground">Commercial posture for this client account, not just one invoice.</p>
        </div>
        <Badge className={getCollectionsStateTone(summary.latestCollectionsAction?.event_type ?? null)} variant="secondary">
          {collectionsLabel}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-border/70 bg-background/80 p-3">
          <div className="text-xs text-muted-foreground">Open balance</div>
          <div className="mt-1 text-lg font-semibold text-foreground">${summary.openBalance.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/80 p-3">
          <div className="text-xs text-muted-foreground">Overdue balance</div>
          <div className="mt-1 text-lg font-semibold text-foreground">${summary.overdueBalance.toFixed(2)}</div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/80 p-3">
          <div className="text-xs text-muted-foreground">Open invoices</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{summary.openInvoices}</div>
        </div>
        <div className="rounded-lg border border-border/70 bg-background/80 p-3">
          <div className="text-xs text-muted-foreground">Oldest overdue</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{summary.oldestOverdueAgeDays ?? 0}d</div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm">
          <div className="font-medium text-foreground">Billing profile</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline">{formatInvoiceTermsLabel(invoiceTermsDays)}</Badge>
            <Badge variant="outline">Reminder: {formatReminderPreferenceLabel(billingReminderPreference)}</Badge>
            <Badge variant="outline">Overdue invoices: {summary.overdueInvoices}</Badge>
          </div>
          {billingNotes.trim() ? <p className="mt-2 text-muted-foreground whitespace-pre-line">{billingNotes}</p> : null}
        </div>

        <div className="rounded-lg border border-border/70 bg-background/80 p-3 text-sm">
          <div className="font-medium text-foreground">Latest collections context</div>
          {summary.latestCollectionsAction ? (
            <>
              <p className="mt-2 text-muted-foreground whitespace-pre-line">{summary.latestCollectionsAction.body || summary.latestCollectionsAction.subject}</p>
              <p className="mt-2 text-xs text-muted-foreground/80">
                {formatDistanceToNow(new Date(summary.latestCollectionsAction.created_at), { addSuffix: true })}
              </p>
            </>
          ) : (
            <p className="mt-2 text-muted-foreground">No reminder/handled/hold/dispute action has been logged for this account yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
