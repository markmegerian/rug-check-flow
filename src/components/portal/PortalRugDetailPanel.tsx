import { useCallback, useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Camera, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  supabaseExtended,
} from "@/integrations/supabase/extended";
import {
  type RugRow,
  type EstimateRow,
  type EstimateItemRow,
  STATUS_LABELS,
  STATUS_VARIANTS,
  isCleaningLineItem,
  formatDate,
} from "./portal-rug-types";
import { RugJourneyTimeline } from "./RugJourneyTimeline";

interface PortalRugDetailPanelProps {
  rug: RugRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PortalRugDetailPanel({ rug, open, onOpenChange }: PortalRugDetailPanelProps) {
  const { toast } = useToast();
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [lineItemsByEstimate, setLineItemsByEstimate] = useState<Record<string, EstimateItemRow[]>>({});
  const [loadingEstimates, setLoadingEstimates] = useState(false);

  const loadEstimates = useCallback(async (rugId: string) => {
    setLoadingEstimates(true);
    const { data, error } = await supabaseExtended
      .from("estimates")
      .select("id, rug_id, estimate_number, status, total")
      .eq("rug_id", rugId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      toast({ title: "Failed to load estimates", description: error.message, variant: "destructive" });
      setLoadingEstimates(false);
      return;
    }

    const rows = (data ?? []) as EstimateRow[];
    setEstimates(rows);

    if (rows.length > 0) {
      const estimateIds = rows.map((e) => e.id);
      const { data: items } = await supabaseExtended
        .from("estimate_items")
        .select("id, estimate_id, description, quantity, unit_price, total, client_approved, service_category")
        .in("estimate_id", estimateIds);

      const grouped: Record<string, EstimateItemRow[]> = {};
      for (const item of (items ?? []) as EstimateItemRow[]) {
        if (!grouped[item.estimate_id]) grouped[item.estimate_id] = [];
        grouped[item.estimate_id].push(item);
      }
      setLineItemsByEstimate(grouped);
    }
    setLoadingEstimates(false);
  }, [toast]);

  useEffect(() => {
    if (open && rug) {
      loadEstimates(rug.id);
    } else {
      setEstimates([]);
      setLineItemsByEstimate({});
    }
  }, [open, rug, loadEstimates]);

  const handleLineItemDecision = async (itemId: string, approved: boolean) => {
    const { error } = await supabaseExtended
      .from("estimate_items")
      .update({ client_approved: approved, client_decision_at: new Date().toISOString() })
      .eq("id", itemId);

    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }

    setLineItemsByEstimate((prev) => {
      const next = { ...prev };
      for (const [estId, items] of Object.entries(next)) {
        next[estId] = items.map((i) =>
          i.id === itemId ? { ...i, client_approved: approved } : i
        );
      }
      return next;
    });
    toast({ title: approved ? "Approved" : "Rejected" });
  };

  if (!rug) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-mono">{rug.tag}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-4">
          {/* Rug Journey Timeline */}
          <RugJourneyTimeline rug={rug} />

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Dimensions</span>
              <p>{rug.size_length ?? 0}&apos; × {rug.size_width ?? 0}&apos;</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Type</span>
              <p>{rug.description || "Rug"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Status</span>
              <div className="mt-0.5">
                <Badge variant={STATUS_VARIANTS[rug.status] ?? "outline"} className="text-[11px]">
                  {STATUS_LABELS[rug.status] ?? rug.status}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Checked in</span>
              <p>{formatDate(rug.checked_in_at)}</p>
            </div>
          </div>

          {/* Services */}
          {rug.services && rug.services.length > 0 && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Services</span>
              <div className="flex flex-wrap gap-1.5">
                {rug.services.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Estimates */}
          <div>
            <span className="text-xs text-muted-foreground block mb-2">Estimates</span>
            {loadingEstimates ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : estimates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No estimates for this rug.</p>
            ) : (
              <div className="space-y-3">
                {estimates.map((est) => (
                  <EstimateCard
                    key={est.id}
                    estimate={est}
                    lineItems={lineItemsByEstimate[est.id] ?? []}
                    onLineItemDecision={handleLineItemDecision}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          {rug.notes && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Notes</span>
              <p className="text-sm">{rug.notes}</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EstimateCard({
  estimate,
  lineItems,
  onLineItemDecision,
}: {
  estimate: EstimateRow;
  lineItems: EstimateItemRow[];
  onLineItemDecision: (itemId: string, approved: boolean) => void;
}) {
  const statusBadge = () => {
    switch (estimate.status) {
      case "sent":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-[10px]">Pending</Badge>;
      case "approved":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-[10px]">Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-[10px]">Rejected</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{estimate.status}</Badge>;
    }
  };

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{estimate.estimate_number}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">${Number(estimate.total ?? 0).toFixed(2)}</span>
          {statusBadge()}
        </div>
      </div>

      {lineItems.length > 0 && (
        <div className="space-y-1.5">
          {lineItems.map((item) => {
            const isCleaning = isCleaningLineItem(item.service_category);
            const canDecide = estimate.status === "sent" && !isCleaning;

            return (
              <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <span className="truncate block">{item.description}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.quantity} × ${Number(item.unit_price).toFixed(2)}
                  </span>
                </div>
                <span className="text-sm font-medium shrink-0">${Number(item.total).toFixed(2)}</span>
                {canDecide && (
                  <div className="flex gap-1 shrink-0">
                    {item.client_approved === true ? (
                      <Badge className="bg-green-100 text-green-800 text-[10px]">Approved</Badge>
                    ) : item.client_approved === false ? (
                      <Badge className="bg-red-100 text-red-800 text-[10px]">Rejected</Badge>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => onLineItemDecision(item.id, true)}
                        >
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => onLineItemDecision(item.id, false)}
                        >
                          <X className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </>
                    )}
                  </div>
                )}
                {isCleaning && (
                  <Badge variant="outline" className="text-[10px] shrink-0">Included</Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
