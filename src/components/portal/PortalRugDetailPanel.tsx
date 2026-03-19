import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Check, Loader2, X } from "lucide-react";

import {
  type RugRow,
  type EstimateRow,
  type EstimateItemRow,
  STATUS_LABELS,
  STATUS_VARIANTS,
  isCleaningLineItem,
  formatDate,
} from "./portal-rug-types";
import type { EstimateStatus } from "@/lib/workflow-guards";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PortalRugDetailPanelProps {
  rug: RugRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimates: EstimateRow[] | undefined;
  lineItemsByEstimateId: Record<string, EstimateItemRow[]>;
  loadingEstimates: boolean;
  estimateRequested: boolean;
  onLineItemDecision: (item: EstimateItemRow, approved: boolean) => void;
  updatingItemId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const estimateStatusBadge = (status: EstimateStatus) => {
  if (status === "sent")
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Pending approval</Badge>;
  if (status === "approved")
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Approved</Badge>;
  if (status === "rejected")
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Rejected</Badge>;
  if (status === "expired") return <Badge variant="secondary">Expired</Badge>;
  return <Badge variant="outline">Draft</Badge>;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PortalRugDetailPanel({
  rug,
  open,
  onOpenChange,
  estimates,
  lineItemsByEstimateId,
  loadingEstimates,
  estimateRequested,
  onLineItemDecision,
  updatingItemId,
}: PortalRugDetailPanelProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {rug ? (
              <>
                <span className="font-mono">{rug.tag}</span>
                <Badge variant={STATUS_VARIANTS[rug.status]} className="text-[11px]">
                  {STATUS_LABELS[rug.status]}
                </Badge>
              </>
            ) : (
              "Rug Detail"
            )}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Details for rug {rug?.tag ?? ""}
          </SheetDescription>
        </SheetHeader>

        {!rug ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Rug not found.
          </p>
        ) : (
          <div className="space-y-5 pt-4">
            {/* Photo */}
            {rug.photo_url && (
              <img
                src={rug.photo_url}
                alt={`Rug ${rug.tag}`}
                className="w-full rounded-lg border object-cover max-h-48"
              />
            )}

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Dimensions</p>
                <p>
                  {rug.size_length != null && rug.size_width != null
                    ? `${Number(rug.size_length)}' x ${Number(rug.size_width)}'`
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rug Type</p>
                <p>{rug.description || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <p>{STATUS_LABELS[rug.status]}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Checked In</p>
                <p>{formatDate(rug.checked_in_at)}</p>
              </div>
            </div>

            <Separator />

            {/* Services */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Services
              </h4>
              {rug.services.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {rug.services.map((service) => (
                    <Badge key={service} variant="secondary" className="text-xs">
                      {service}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  No services assigned.
                </p>
              )}
            </div>

            <Separator />

            {/* Estimates */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Estimates
              </h4>

              {estimateRequested && (!estimates || estimates.length === 0) && !loadingEstimates && (
                <Badge variant="outline" className="text-xs">
                  Estimate requested — pending
                </Badge>
              )}

              {loadingEstimates ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Loading estimates...</p>
                </div>
              ) : !estimates || estimates.length === 0 ? (
                !estimateRequested && (
                  <p className="text-xs text-muted-foreground italic">
                    No estimates for this rug.
                  </p>
                )
              ) : (
                <div className="space-y-3">
                  {estimates.map((est) => (
                    <EstimateCard
                      key={est.id}
                      estimate={est}
                      lineItems={lineItemsByEstimateId[est.id] ?? []}
                      onLineItemDecision={onLineItemDecision}
                      updatingItemId={updatingItemId}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            {rug.notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Notes
                  </h4>
                  <p className="text-sm whitespace-pre-wrap">{rug.notes}</p>
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// EstimateCard (sub-component)
// ---------------------------------------------------------------------------

function EstimateCard({
  estimate,
  lineItems,
  onLineItemDecision,
  updatingItemId,
}: {
  estimate: EstimateRow;
  lineItems: EstimateItemRow[];
  onLineItemDecision: (item: EstimateItemRow, approved: boolean) => void;
  updatingItemId: string | null;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-sm text-foreground">
            {estimate.estimate_number}
          </p>
          <p className="text-xs text-muted-foreground">
            Total ${Number(estimate.total).toFixed(2)}
          </p>
        </div>
        {estimateStatusBadge(estimate.status)}
      </div>

      {estimate.status === "sent" && lineItems.length > 0 && (
        <div className="rounded border bg-background p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Line items
          </p>
          <ul className="text-sm space-y-2">
            {lineItems.map((item) => {
              const isCleaning = isCleaningLineItem(item);
              const decided = item.client_approved !== null;
              const isUpdating = updatingItemId === item.id;
              const qty = Number(item.quantity);
              const unit = Number(item.unit_price);
              const lineTotal = Number(item.total);

              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border/60 last:border-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground font-medium">
                      {item.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {qty} x ${unit.toFixed(2)} = ${lineTotal.toFixed(2)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isCleaning ? (
                      <Badge variant="secondary" className="text-xs">
                        Included
                      </Badge>
                    ) : decided ? (
                      item.client_approved ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          Approved
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                          Rejected
                        </Badge>
                      )
                    ) : (
                      <>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => onLineItemDecision(item, true)}
                          disabled={isUpdating}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs"
                          onClick={() => onLineItemDecision(item, false)}
                          disabled={isUpdating}
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
    </div>
  );
}
