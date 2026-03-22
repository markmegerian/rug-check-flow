import { Badge } from "@/components/ui/badge";
import type { PickupRequestStatus, EstimateStatus } from "@/lib/workflow-guards";

const PICKUP_STATUS_STYLES: Record<PickupRequestStatus, { label: string; className: string; variant: "outline" | "secondary" | "default" }> = {
  pending: { label: "Pending", className: "", variant: "outline" },
  confirmed: { label: "Confirmed", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", variant: "default" },
  assigned: { label: "Assigned", className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", variant: "default" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", variant: "default" },
  cancelled: { label: "Cancelled", className: "", variant: "secondary" },
};

const ESTIMATE_STATUS_STYLES: Record<EstimateStatus, { label: string; className: string; variant: "outline" | "secondary" | "default" }> = {
  draft: { label: "Draft", className: "", variant: "outline" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", variant: "default" },
  approved: { label: "Approved", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", variant: "default" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", variant: "default" },
  expired: { label: "Expired", className: "", variant: "secondary" },
};

const DELIVERY_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  compiling: { label: "Compiling", className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  confirmed: { label: "Confirmed", className: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  checked_out: { label: "Checked Out", className: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" },
};

const RUG_STATUS_STYLES: Record<string, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  in_production: { label: "In Production", className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  checked_in: { label: "Checked In", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  picked_up: { label: "Picked Up", className: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200" },
};

export function PickupStatusBadge({ status }: { status: PickupRequestStatus }) {
  const style = PICKUP_STATUS_STYLES[status];
  return <Badge variant={style.variant} className={style.className}>{style.label}</Badge>;
}

export function EstimateStatusBadge({ status }: { status: EstimateStatus }) {
  const style = ESTIMATE_STATUS_STYLES[status];
  return <Badge variant={style.variant} className={style.className}>{style.label}</Badge>;
}

export function DeliveryStatusBadge({ status }: { status: string }) {
  const style = DELIVERY_STATUS_STYLES[status];
  if (!style) return <Badge variant="outline">{status}</Badge>;
  return <Badge variant="outline" className={style.className}>{style.label}</Badge>;
}

export function RugStatusBadge({ status, className }: { status: string; className?: string }) {
  const style = RUG_STATUS_STYLES[status];
  if (!style) return <Badge variant="secondary" className={className}>{status}</Badge>;
  return <Badge className={`${style.className} ${className ?? ""}`}>{style.label}</Badge>;
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

const INVOICE_STATUS_STYLES: Record<InvoiceStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sent: { label: "Sent", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

export function InvoiceStatusBadge({ status }: { status: string }) {
  const style = INVOICE_STATUS_STYLES[status as InvoiceStatus];
  if (!style) return <Badge variant="secondary">{status}</Badge>;
  return <Badge className={style.className} variant="secondary">{style.label}</Badge>;
}
