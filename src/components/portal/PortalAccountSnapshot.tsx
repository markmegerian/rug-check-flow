import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { ACTIVE_STATUSES } from "./portal-rug-types";
import { getCollectionsStateBadgeClass, getPortalBillingState } from "@/lib/billing";

type PortalSnapshotTab = "rugs" | "estimates" | "invoices" | "messages";

type PortalAccountSnapshotProps = {
  clientId: string;
  onFocusTab?: (tab: PortalSnapshotTab) => void;
};

type SnapshotState = {
  activeRugs: number;
  inProductionRugs: number;
  readyRugs: number;
  pendingEstimates: number;
  openBalance: number;
  overdueBalance: number;
  openInvoices: number;
  overdueInvoices: number;
  nextDueAt: string | null;
  oldestOverdueAgeDays: number | null;
};

export function PortalAccountSnapshot({ clientId, onFocusTab }: PortalAccountSnapshotProps) {
  const [summary, setSummary] = useState<SnapshotState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const [rugsResult, estimatesResult, invoicesResult] = await Promise.all([
        supabase
          .from("rugs")
          .select("id, status")
          .eq("client_id", clientId)
          .in("status", ACTIVE_STATUSES),
        supabaseExtended
          .from("estimates")
          .select("id, status")
          .eq("client_id", clientId)
          .eq("status", "sent")
          .limit(100),
        supabaseExtended
          .from("invoices")
          .select("status, total, due_at, created_at")
          .eq("client_id", clientId)
          .returns<Array<{ status: string; total: number | null; due_at: string | null; created_at: string }>>(),
      ]);

      if (cancelled) return;

      const activeRugRows = rugsResult.data ?? [];
      const invoices = invoicesResult.data ?? [];
      const openInvoices = invoices.filter((invoice) => ["sent", "overdue"].includes(invoice.status));
      const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue");
      const datedOpenInvoices = openInvoices.filter((invoice) => Boolean(invoice.due_at));
      const nextDueAt = datedOpenInvoices.length > 0
        ? [...datedOpenInvoices].sort((a, b) => Date.parse(a.due_at ?? a.created_at) - Date.parse(b.due_at ?? b.created_at))[0]?.due_at ?? null
        : null;
      const oldestOverdueAgeDays = overdueInvoices.length > 0
        ? Math.max(...overdueInvoices.map((invoice) => Math.max(0, Math.floor((Date.now() - Date.parse(invoice.due_at ?? invoice.created_at)) / 86_400_000))))
        : null;

      setSummary({
        activeRugs: activeRugRows.length,
        inProductionRugs: activeRugRows.filter((rug) => rug.status === "in_production").length,
        readyRugs: activeRugRows.filter((rug) => rug.status === "ready").length,
        pendingEstimates: estimatesResult.data?.length ?? 0,
        openBalance: openInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0),
        overdueBalance: overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0),
        openInvoices: openInvoices.length,
        overdueInvoices: overdueInvoices.length,
        nextDueAt,
        oldestOverdueAgeDays,
      });
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [clientId]);

  const billingState = useMemo(() => getPortalBillingState({
    overdueInvoices: summary?.overdueInvoices ?? 0,
    oldestOverdueAgeDays: summary?.oldestOverdueAgeDays ?? null,
    openInvoices: summary?.openInvoices ?? 0,
    nextDueAt: summary?.nextDueAt ?? null,
  }), [summary]);

  const headline = useMemo(() => {
    if (!summary) return "Loading account snapshot…";
    if (summary.overdueInvoices > 0) return "You have invoices that need payment attention.";
    if (summary.pendingEstimates > 0) return "You have estimates waiting for review.";
    if (summary.activeRugs > 0) return "Your current rugs and billing activity are summarized below.";
    return "Your account is currently quiet.";
  }, [summary]);
  const attentionItems = useMemo(() => {
    if (!summary) return [] as Array<{ key: string; title: string; detail: string; tab: PortalSnapshotTab }>;
    const items: Array<{ key: string; title: string; detail: string; tab: PortalSnapshotTab }> = [];
    if (summary.overdueInvoices > 0) {
      items.push({
        key: "overdue-invoices",
        title: `${summary.overdueInvoices} overdue invoice${summary.overdueInvoices === 1 ? "" : "s"}`,
        detail: `Review payment details for $${summary.overdueBalance.toFixed(2)} overdue.`,
        tab: "messages",
      });
    } else if (summary.openInvoices > 0) {
      items.push({
        key: "open-invoices",
        title: `${summary.openInvoices} open invoice${summary.openInvoices === 1 ? "" : "s"}`,
        detail: `Check the current balance of $${summary.openBalance.toFixed(2)}.`,
        tab: "messages",
      });
    }
    if (summary.pendingEstimates > 0) {
      items.push({
        key: "pending-estimates",
        title: `${summary.pendingEstimates} estimate${summary.pendingEstimates === 1 ? "" : "s"} awaiting review`,
        detail: "Approve or reject proposed work from the Estimates tab, or message the office team for clarification.",
        tab: "messages",
      });
    }
    if (summary.readyRugs > 0 || summary.inProductionRugs > 0) {
      items.push({
        key: "active-rugs",
        title: `${summary.readyRugs} ready · ${summary.inProductionRugs} in production`,
        detail: "Review current rug progress and pickup readiness.",
        tab: "rugs",
      });
    }
    return items;
  }, [summary]);


  if (loading || !summary) {
    return <div className="rounded-2xl border border-border/70 bg-card/90 px-4 py-5 text-sm text-muted-foreground">Loading account snapshot…</div>;
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Account snapshot</h2>
          <p className="text-sm text-muted-foreground">{headline}</p>
        </div>
        <Badge className={getCollectionsStateBadgeClass(billingState.tone)} variant="secondary">
          {billingState.label}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-border/70 bg-background/80 p-3">
          <div className="text-xs text-muted-foreground">Active rugs</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{summary.activeRugs}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/80 p-3">
          <div className="text-xs text-muted-foreground">In production</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{summary.inProductionRugs}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/80 p-3">
          <div className="text-xs text-muted-foreground">Ready rugs</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{summary.readyRugs}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/80 p-3">
          <div className="text-xs text-muted-foreground">Pending estimates</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{summary.pendingEstimates}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/80 p-3">
          <div className="text-xs text-muted-foreground">Overdue balance</div>
          <div className="mt-1 text-lg font-semibold text-foreground">${summary.overdueBalance.toFixed(2)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">Open invoices: {summary.openInvoices}</Badge>
        <Badge variant="outline">Open balance: ${summary.openBalance.toFixed(2)}</Badge>
        <Badge variant="outline">Overdue invoices: {summary.overdueInvoices}</Badge>
        <Badge variant="outline">Next due: {summary.nextDueAt ? new Date(summary.nextDueAt).toLocaleDateString("en-US") : "No balance due"}</Badge>
      </div>

      {attentionItems.length > 0 ? (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">What needs attention</h3>
            <p className="text-sm text-muted-foreground">Jump straight to the part of the portal that matters right now.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {attentionItems.map((item) => (
              <div key={item.key} className="rounded-xl border border-border/70 bg-background/80 p-3 space-y-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{item.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{item.detail}</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => onFocusTab?.(item.tab)}>
                  Open {item.tab}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
