import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { ACTIVE_STATUSES } from "./portal-rug-types";
import { getCollectionsStateBadgeClass, getPortalBillingState } from "@/lib/billing";

type PortalAccountSnapshotProps = {
  clientId: string;
};

type SnapshotState = {
  activeRugs: number;
  pendingEstimates: number;
  openBalance: number;
  overdueBalance: number;
  openInvoices: number;
  overdueInvoices: number;
  nextDueAt: string | null;
  oldestOverdueAgeDays: number | null;
};

export function PortalAccountSnapshot({ clientId }: PortalAccountSnapshotProps) {
  const [summary, setSummary] = useState<SnapshotState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const [rugsResult, estimatesResult, invoicesResult] = await Promise.all([
        supabase
          .from("rugs")
          .select("id", { count: "exact", head: true })
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
        activeRugs: rugsResult.count ?? 0,
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border/70 bg-background/80 p-3">
          <div className="text-xs text-muted-foreground">Active rugs</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{summary.activeRugs}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/80 p-3">
          <div className="text-xs text-muted-foreground">Pending estimates</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{summary.pendingEstimates}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/80 p-3">
          <div className="text-xs text-muted-foreground">Open balance</div>
          <div className="mt-1 text-lg font-semibold text-foreground">${summary.openBalance.toFixed(2)}</div>
        </div>
        <div className="rounded-xl border border-border/70 bg-background/80 p-3">
          <div className="text-xs text-muted-foreground">Overdue balance</div>
          <div className="mt-1 text-lg font-semibold text-foreground">${summary.overdueBalance.toFixed(2)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">Open invoices: {summary.openInvoices}</Badge>
        <Badge variant="outline">Overdue invoices: {summary.overdueInvoices}</Badge>
        <Badge variant="outline">Next due: {summary.nextDueAt ? new Date(summary.nextDueAt).toLocaleDateString("en-US") : "No balance due"}</Badge>
      </div>
    </section>
  );
}
