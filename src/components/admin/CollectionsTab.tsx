import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { differenceInCalendarDays, formatDistanceToNow } from "date-fns";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/states/PageState";
import { InvoiceStatusBadge } from "@/components/shared/StatusBadge";
import { useSuperAdminQueues, type OverdueInvoiceItem } from "@/hooks/useSuperAdminQueues";
import { toast } from "@/hooks/use-toast";
import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";

type CollectionsActionEvent = Pick<
  ExtendedTableRow<"communication_events">,
  "id" | "client_id" | "invoice_id" | "event_type" | "subject" | "body" | "created_at"
>;

type CollectionsActionType =
  | "collections_reminder_sent"
  | "collections_account_handled"
  | "collections_account_on_hold"
  | "collections_account_disputed";

type ActionDraft = {
  clientId: string;
  clientName: string;
  eventType: CollectionsActionType;
  note: string;
  primaryInvoiceId: string | null;
  invoiceNumbers: string[];
  overdueTotal: number;
};

type ClientCollectionGroup = {
  clientId: string;
  clientName: string;
  invoices: OverdueInvoiceItem[];
  overdueTotal: number;
  oldestAgeDays: number;
  latestAction: CollectionsActionEvent | null;
  nextAction: {
    label: string;
    tone: "warning" | "success" | "danger" | "neutral";
  };
};

const COLLECTION_ACTION_META: Record<
  CollectionsActionType,
  { label: string; description: string; channel: "email" | "in_app_chat" }
> = {
  collections_reminder_sent: {
    label: "Reminder sent",
    description: "Log that collections follow-up went out to this client account.",
    channel: "email",
  },
  collections_account_handled: {
    label: "Marked handled",
    description: "Log that this account has an owner and a current follow-up plan.",
    channel: "in_app_chat",
  },
  collections_account_on_hold: {
    label: "Placed on hold",
    description: "Log that the account is intentionally paused from normal collections follow-up.",
    channel: "in_app_chat",
  },
  collections_account_disputed: {
    label: "Marked disputed",
    description: "Log that the overdue balance is under review or being challenged.",
    channel: "in_app_chat",
  },
};

function getInvoiceAgeDays(invoice: OverdueInvoiceItem) {
  const dueBase = invoice.due_at ?? invoice.created_at;
  return Math.max(0, differenceInCalendarDays(new Date(), new Date(dueBase)));
}

function getLatestActions(events: CollectionsActionEvent[]) {
  const byClient = new Map<string, CollectionsActionEvent>();
  for (const event of events) {
    if (!event.client_id || byClient.has(event.client_id)) continue;
    byClient.set(event.client_id, event);
  }
  return byClient;
}

function getNextCollectionsAction(
  latestAction: CollectionsActionEvent | null,
  oldestAgeDays: number,
): ClientCollectionGroup["nextAction"] {
  if (!latestAction) {
    if (oldestAgeDays >= 14) return { label: "Escalate collections follow-up now", tone: "danger" };
    if (oldestAgeDays >= 7) return { label: "Reminder is due", tone: "warning" };
    return { label: "Monitor and prep reminder cadence", tone: "neutral" };
  }

  if (latestAction.event_type === "collections_account_on_hold") {
    return { label: "Account on hold — wait for manual release", tone: "neutral" };
  }

  if (latestAction.event_type === "collections_account_disputed") {
    return { label: "Dispute open — resolve before further collections", tone: "warning" };
  }

  if (latestAction.event_type === "collections_account_handled") {
    return oldestAgeDays >= 14
      ? { label: "Handled, but aging still high — verify next step", tone: "warning" }
      : { label: "Handled — monitor for payment or reply", tone: "success" };
  }

  const daysSinceAction = Math.max(0, differenceInCalendarDays(new Date(), new Date(latestAction.created_at)));
  if (daysSinceAction >= 3 && oldestAgeDays >= 14) {
    return { label: "Reminder aged out — escalate account", tone: "danger" };
  }
  if (daysSinceAction >= 3) {
    return { label: "Follow-up reminder window reopened", tone: "warning" };
  }
  return { label: "Recently reminded — wait for response", tone: "success" };
}

function nextActionToneClass(tone: ClientCollectionGroup["nextAction"]["tone"]) {
  if (tone === "danger") return "border-red-200/70 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-100";
  if (tone === "warning") return "border-amber-200/70 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100";
  if (tone === "success") return "border-emerald-200/70 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100";
  return "border-border/70 bg-muted/40 text-foreground";
}

async function fetchCollectionsActions(clientIds: string[]) {
  if (clientIds.length === 0) return [] as CollectionsActionEvent[];

  const { data, error } = await supabaseExtended
    .from("communication_events")
    .select("id, client_id, invoice_id, event_type, subject, body, created_at")
    .in("client_id", clientIds)
    .in("event_type", Object.keys(COLLECTION_ACTION_META))
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) throw error;
  return (data ?? []) as CollectionsActionEvent[];
}

export function CollectionsTab() {
  const query = useSuperAdminQueues();
  const queryClient = useQueryClient();
  const [actionDraft, setActionDraft] = useState<ActionDraft | null>(null);
  const [savingAction, setSavingAction] = useState(false);

  const clientIds = useMemo(
    () => Array.from(new Set((query.data?.overdueInvoices ?? []).map((invoice) => invoice.client_id).filter((value): value is string => Boolean(value)))),
    [query.data?.overdueInvoices],
  );

  const actionsQuery = useQuery({
    queryKey: ["collections-actions", clientIds.slice().sort().join(",")],
    queryFn: () => fetchCollectionsActions(clientIds),
    enabled: clientIds.length > 0,
    staleTime: 60_000,
  });

  const groupedClients = useMemo(() => {
    const latestActions = getLatestActions(actionsQuery.data ?? []);
    const grouped = new Map<string, Omit<ClientCollectionGroup, "nextAction">>();

    for (const invoice of query.data?.overdueInvoices ?? []) {
      const clientId = invoice.client_id ?? `unknown-${invoice.id}`;
      const existing = grouped.get(clientId) ?? {
        clientId,
        clientName: invoice.clients?.name ?? "Unknown client",
        invoices: [],
        overdueTotal: 0,
        oldestAgeDays: 0,
        latestAction: clientId.startsWith("unknown-") ? null : latestActions.get(clientId) ?? null,
      };

      existing.invoices.push(invoice);
      existing.overdueTotal += Number(invoice.total ?? 0);
      existing.oldestAgeDays = Math.max(existing.oldestAgeDays, getInvoiceAgeDays(invoice));
      grouped.set(clientId, existing);
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        invoices: [...group.invoices].sort((a, b) => Date.parse(a.due_at ?? a.created_at) - Date.parse(b.due_at ?? b.created_at)),
        nextAction: getNextCollectionsAction(group.latestAction, group.oldestAgeDays),
      }))
      .sort((a, b) => {
        if (b.oldestAgeDays !== a.oldestAgeDays) return b.oldestAgeDays - a.oldestAgeDays;
        return b.overdueTotal - a.overdueTotal;
      });
  }, [actionsQuery.data, query.data?.overdueInvoices]);

  const openActionDialog = (group: ClientCollectionGroup, eventType: CollectionsActionType) => {
    setActionDraft({
      clientId: group.clientId,
      clientName: group.clientName,
      eventType,
      note: "",
      primaryInvoiceId: group.invoices[0]?.id ?? null,
      invoiceNumbers: group.invoices.map((invoice) => invoice.invoice_number),
      overdueTotal: group.overdueTotal,
    });
  };

  const saveAction = async () => {
    if (!actionDraft) return;
    const meta = COLLECTION_ACTION_META[actionDraft.eventType];
    setSavingAction(true);

    const lines = [
      `${meta.label} for client account ${actionDraft.clientName}.`,
      `Overdue total: $${actionDraft.overdueTotal.toFixed(2)}`,
      `Invoices: ${actionDraft.invoiceNumbers.join(", ")}`,
      actionDraft.note.trim() ? `Note: ${actionDraft.note.trim()}` : null,
    ].filter(Boolean);

    const { error } = await supabaseExtended.from("communication_events").insert({
      client_id: actionDraft.clientId,
      invoice_id: actionDraft.primaryInvoiceId,
      channel: meta.channel,
      direction: "outbound",
      event_type: actionDraft.eventType,
      subject: `${actionDraft.clientName} — ${meta.label}`,
      body: lines.join("\n"),
    });

    if (error) {
      toast({ title: "Collections action failed", description: error.message, variant: "destructive" });
      setSavingAction(false);
      return;
    }

    toast({ title: meta.label, description: `${actionDraft.clientName} updated in collections queue.` });
    setActionDraft(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["super-admin-queues"] }),
      queryClient.invalidateQueries({ queryKey: ["collections-actions"] }),
    ]);
    setSavingAction(false);
  };

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
    <>
      <div className="app-page h-full overflow-auto space-y-4 animate-fade-in-up">
        <div className="app-section-header">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Collections queue</h2>
            <p className="text-sm text-muted-foreground">
              ${query.data.totals.overdueBalance.toFixed(2)} overdue across {query.data.totals.overdueInvoices} invoice(s) · {groupedClients.length} client account{groupedClients.length === 1 ? "" : "s"}
            </p>
          </div>
          {actionsQuery.isFetching ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Refreshing actions
            </div>
          ) : null}
        </div>

        {groupedClients.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-card/70 p-8 text-center text-muted-foreground">No overdue invoices right now.</div>
        ) : groupedClients.map((group) => (
          <section key={group.clientId} className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div>
                  <h3 className="text-base font-semibold text-foreground">{group.clientName}</h3>
                  <p className="text-sm text-muted-foreground">
                    ${group.overdueTotal.toFixed(2)} overdue across {group.invoices.length} invoice{group.invoices.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">Oldest {group.oldestAgeDays} day{group.oldestAgeDays === 1 ? "" : "s"} late</Badge>
                  {group.latestAction ? (
                    <Badge variant="outline">
                      {COLLECTION_ACTION_META[group.latestAction.event_type as CollectionsActionType]?.label ?? group.latestAction.event_type} {formatDistanceToNow(new Date(group.latestAction.created_at), { addSuffix: true })}
                    </Badge>
                  ) : (
                    <Badge variant="outline">No collections action logged yet</Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => openActionDialog(group, "collections_reminder_sent")}>Mark reminder sent</Button>
                <Button size="sm" variant="outline" onClick={() => openActionDialog(group, "collections_account_handled")}>Mark handled</Button>
                <Button size="sm" variant="outline" onClick={() => openActionDialog(group, "collections_account_on_hold")}>Place on hold</Button>
                <Button size="sm" variant="outline" onClick={() => openActionDialog(group, "collections_account_disputed")}>Mark disputed</Button>
              </div>
            </div>

            <div className={`rounded-xl border p-3 text-sm ${nextActionToneClass(group.nextAction.tone)}`}>
              <div className="font-medium">Next action</div>
              <div className="mt-1">{group.nextAction.label}</div>
            </div>

            {group.latestAction?.body ? (
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground whitespace-pre-line">
                <span className="font-medium text-foreground">Last logged action</span>
                <div className="mt-1">{group.latestAction.body}</div>
              </div>
            ) : null}

            <div className="space-y-2">
              {group.invoices.map((invoice) => {
                const dueBase = invoice.due_at ?? invoice.created_at;
                const ageDays = getInvoiceAgeDays(invoice);
                return (
                  <div key={invoice.id} className="rounded-xl border border-border/70 bg-background/80 p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{invoice.invoice_number}</p>
                        <p className="mt-1 text-sm text-muted-foreground">${Number(invoice.total ?? 0).toFixed(2)}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <InvoiceStatusBadge status={invoice.status} />
                        <Badge variant="outline">{ageDays} day{ageDays === 1 ? "" : "s"} late</Badge>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {invoice.due_at
                        ? `Due ${formatDistanceToNow(new Date(invoice.due_at), { addSuffix: true })}`
                        : `Created ${formatDistanceToNow(new Date(invoice.created_at), { addSuffix: true })}`} · Base date {new Date(dueBase).toLocaleDateString()}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={Boolean(actionDraft)} onOpenChange={(open) => { if (!open && !savingAction) setActionDraft(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionDraft ? COLLECTION_ACTION_META[actionDraft.eventType].label : "Collections action"}</DialogTitle>
            <DialogDescription>
              {actionDraft ? COLLECTION_ACTION_META[actionDraft.eventType].description : "Log a collections action."}
            </DialogDescription>
          </DialogHeader>

          {actionDraft ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
                <div className="font-medium text-foreground">{actionDraft.clientName}</div>
                <div className="mt-1 text-muted-foreground">
                  ${actionDraft.overdueTotal.toFixed(2)} overdue · {actionDraft.invoiceNumbers.length} invoice{actionDraft.invoiceNumbers.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="collections-action-note">Note</label>
                <Textarea
                  id="collections-action-note"
                  value={actionDraft.note}
                  onChange={(event) => setActionDraft((current) => current ? { ...current, note: event.target.value } : current)}
                  rows={6}
                  placeholder="Optional note about outreach, hold reason, dispute details, promised payment date..."
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" disabled={savingAction} onClick={() => setActionDraft(null)}>Cancel</Button>
            <Button disabled={savingAction} onClick={() => void saveAction()}>
              {savingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
