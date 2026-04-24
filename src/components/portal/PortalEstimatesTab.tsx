import { useCallback, useEffect, useMemo, useState } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { PortalTabProps } from "./portal-tab-props";
import { Check, FileText, X } from "lucide-react";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { isRugServiceApprovalStatusAvailable } from "@/lib/rug-service-approval";
import { transitionEstimateStatus } from "@/lib/estimate-group-actions";
import { fetchPortalEstimates, type PortalEstimateItemRow, type PortalEstimateRow } from "@/lib/portal-estimates";
import { canRoleTransitionEstimateStatus, type EstimateStatus } from "@/lib/workflow-guards";

type EstimateRow = PortalEstimateRow;
type EstimateItemRow = PortalEstimateItemRow;

/** Cleaning is always approved and not rejectable; only other services can be approved/rejected by client. */
function isCleaningLineItem(item: EstimateItemRow): boolean {
  return item.service_category?.toLowerCase() === "cleaning";
}

const statusBadge = (status: EstimateStatus) => {
  if (status === "sent") return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Review needed</Badge>;
  if (status === "approved") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Rejected</Badge>;
  if (status === "expired") return <Badge variant="secondary">Expired</Badge>;
  return <Badge variant="outline">Draft</Badge>;
};

export default function PortalEstimatesTab({ clientId, loading: portalClientLoading, errorMessage }: PortalTabProps) {
  const { toast } = useToast();
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [lineItemsByEstimateId, setLineItemsByEstimateId] = useState<Record<string, EstimateItemRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});

  const fetchEstimates = useCallback(async () => {
    try {
      const rows = await fetchPortalEstimates();
      setEstimates(rows);
      setLineItemsByEstimateId(
        rows.reduce<Record<string, EstimateItemRow[]>>((acc, estimate) => {
          if (estimate.items.length > 0) {
            acc[estimate.id] = estimate.items;
          }
          return acc;
        }, {})
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Failed to load estimates", description: message, variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    if (portalClientLoading) { setLoading(true); return; }
    if (errorMessage) {
      toast({ title: "No portal access", description: errorMessage, variant: "destructive" });
      setLoading(false); setEstimates([]); return;
    }
    if (!clientId) { setLoading(false); return; }

    const init = async () => {
      setLoading(true);
      await fetchEstimates();
      setLoading(false);
    };

    init();
  }, [clientId, errorMessage, fetchEstimates, portalClientLoading, toast]);

  const updateDecisionNote = (estimateId: string, value: string) => {
    setDecisionNotes((prev) => ({ ...prev, [estimateId]: value }));
  };

  const updateLineItemDecision = useCallback(
    async (item: EstimateItemRow, approved: boolean) => {
      if (item.client_approved !== null) return;
      setUpdatingItemId(item.id);
      const nowIso = new Date().toISOString();
      const { error } = await supabaseExtended
        .from("estimate_items")
        .update({ client_approved: approved, client_decision_at: nowIso })
        .eq("id", item.id);

      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        setUpdatingItemId(null);
        return;
      }
      if (item.rug_service_id && isRugServiceApprovalStatusAvailable()) {
        const { error: serviceError } = await supabaseExtended
          .from("rug_services")
          .update({ approval_status: approved ? "approved" : "rejected" })
          .eq("id", item.rug_service_id);
        if (serviceError) {
          if (/approval_status/i.test(serviceError.message)) {
            console.warn("Service approval sync skipped because approval_status is not live in this environment yet.");
          } else {
            toast({ title: "Service status sync failed", description: serviceError.message, variant: "destructive" });
          }
        }
      }

      setLineItemsByEstimateId((prev) => ({
        ...prev,
        [item.estimate_id]: (prev[item.estimate_id] ?? []).map((i) =>
          i.id === item.id ? { ...i, client_approved: approved, client_decision_at: nowIso } : i
        ),
      }));
      toast({ title: approved ? "Line approved" : "Line rejected" });
      setUpdatingItemId(null);
    },
    [toast]
  );

  const updateStatus = async (estimate: EstimateRow, nextStatus: "approved" | "rejected") => {
    if (!clientId || estimate.status !== "sent") return;
    setUpdatingId(estimate.id);

    if (!canRoleTransitionEstimateStatus("portal", estimate.status, nextStatus)) {
      toast({
        title: "Update blocked",
        description: `Estimate cannot move from ${estimate.status} to ${nextStatus}.`,
        variant: "destructive",
      });
      setUpdatingId(null);
      return;
    }

    try {
      const result = await transitionEstimateStatus({
        estimateId: estimate.id,
        nextStatus,
        note: decisionNotes[estimate.id] ?? "",
      });

      if (result.updatedCount <= 0) {
        toast({ title: "Estimate already updated", description: "Reload and check the latest status." });
        setUpdatingId(null);
        await fetchEstimates();
        return;
      }

      setEstimates((prev) => prev.map((row) => row.id === estimate.id ? {
        ...row,
        status: nextStatus,
        approved_at: result.approvedAt,
        rejected_at: result.rejectedAt,
      } : row));
      setDecisionNotes((prev) => ({ ...prev, [estimate.id]: "" }));
      toast({ title: `Estimate ${nextStatus}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Failed to update estimate", description: message, variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  const pending = useMemo(() => estimates.filter((e) => e.status === "sent"), [estimates]);
  const history = useMemo(() => estimates.filter((e) => e.status !== "sent"), [estimates]);

  const pendingPagination = usePaginatedList(pending);
  const historyPagination = usePaginatedList(history);

  if (portalClientLoading || loading) {
    return <div className="text-sm text-muted-foreground">Loading estimates…</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Estimates
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Review the work below and approve or decline it.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">You do not have any estimates waiting right now.</p>
          ) : (
            pendingPagination.items.map((estimate) => {
              const lineItems = lineItemsByEstimateId[estimate.id] ?? [];
              const isUpdating = updatingId === estimate.id;
              return (
                <div key={estimate.id} className="rounded-lg border bg-muted/30 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{estimate.estimate_number}</p>
                      <p className="text-sm text-muted-foreground">
                        {estimate.rug_tag ?? "—"} · ${Number(estimate.total).toFixed(2)}
                      </p>
                    </div>
                    {statusBadge(estimate.status)}
                  </div>
                  {lineItems.length > 0 && (
                    <div className="rounded border bg-background p-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Services</p>
                      <p className="text-xs text-muted-foreground">Cleaning is included automatically. Other services can be approved or declined.</p>
                      <ul className="text-sm space-y-2">
                        {lineItems.map((item) => {
                          const isCleaning = isCleaningLineItem(item);
                          const decided = item.client_approved !== null;
                          const isUpdatingItem = updatingItemId === item.id;
                          const qty = Number(item.quantity);
                          const unit = Number(item.unit_price);
                          const lineTotal = Number(item.total);
                          return (
                            <li
                              key={item.id}
                              className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border/60 last:border-0 last:pb-0"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-foreground font-medium">{item.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {qty} × ${unit.toFixed(2)} = ${lineTotal.toFixed(2)}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {isCleaning ? (
                                  <Badge variant="secondary" className="text-xs">Included</Badge>
                                ) : decided ? (
                                  item.client_approved ? (
                                    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Approved</Badge>
                                  ) : (
                                    <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Rejected</Badge>
                                  )
                                ) : (
                                  <>
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                                      onClick={() => updateLineItemDecision(item, true)}
                                      disabled={isUpdatingItem}
                                    >
                                      <Check className="h-3 w-3 mr-1" />
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="h-7 text-xs"
                                      onClick={() => updateLineItemDecision(item, false)}
                                      disabled={isUpdatingItem}
                                    >
                                      <X className="h-3 w-3 mr-1" />
                                      Reject
                                    </Button>
                                  </>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Optional note</label>
                    <Textarea
                      value={decisionNotes[estimate.id] ?? ""}
                      onChange={(e) => updateDecisionNote(estimate.id, e.target.value)}
                      placeholder="Add any note you want the team to see."
                      className="min-h-16 text-sm resize-none"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      onClick={() => updateStatus(estimate, "approved")}
                      disabled={isUpdating}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                      {isUpdating ? "Updating…" : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => updateStatus(estimate, "rejected")}
                      disabled={isUpdating}
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      {isUpdating ? "Updating…" : "Decline"}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
          <PaginationControls
            page={pendingPagination.page}
            totalPages={pendingPagination.totalPages}
            total={pendingPagination.total}
            hasPrev={pendingPagination.hasPrev}
            hasNext={pendingPagination.hasNext}
            onPrev={pendingPagination.prevPage}
            onNext={pendingPagination.nextPage}
            label="estimates"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history yet.</p>
          ) : (
            historyPagination.items.map((estimate, index) => (
              <div key={estimate.id}>
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <div>
                    <p className="text-sm font-medium">{estimate.estimate_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {estimate.rug_tag ?? "Unknown rug"} · ${Number(estimate.total).toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(estimate.status)}
                  </div>
                </div>
                {index < historyPagination.items.length - 1 && <Separator />}
              </div>
            ))
          )}
          <PaginationControls
            page={historyPagination.page}
            totalPages={historyPagination.totalPages}
            total={historyPagination.total}
            hasPrev={historyPagination.hasPrev}
            hasNext={historyPagination.hasNext}
            onPrev={historyPagination.prevPage}
            onNext={historyPagination.nextPage}
            label="estimates"
          />
        </CardContent>
      </Card>
    </div>
  );
}

