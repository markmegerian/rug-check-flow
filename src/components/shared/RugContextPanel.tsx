import { Truck, FileText, Camera, Signature, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRugContext, type RugDeliveryInfo, type RugInvoiceInfo } from "@/hooks/useRugContext";

interface RugContextPanelProps {
  rugId: string;
  showDeliveryProofs?: boolean;
}

const INVOICE_STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function DeliverySection({ delivery, showProofs }: { delivery: RugDeliveryInfo; showProofs?: boolean }) {
  const isDelivered = delivery.status === "checked_out";
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Truck className="h-3.5 w-3.5" />
        Delivery
      </h4>
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            {isDelivered ? "Delivered" : "Scheduled"}{" "}
            <span className="font-medium">
              {new Date(delivery.targetDate).toLocaleDateString("en-US", {
                weekday: "short", month: "short", day: "numeric",
              })}
            </span>
          </div>
          <Badge
            variant="secondary"
            className={isDelivered
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-[10px]"
              : "text-[10px]"
            }
          >
            {delivery.status === "checked_out" ? "Delivered" : delivery.status === "confirmed" ? "Confirmed" : "Preparing"}
          </Badge>
        </div>
        {delivery.driverName && (
          <p className="text-xs text-muted-foreground">Driver: {delivery.driverName}</p>
        )}
        {showProofs && delivery.signatureUrl && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Signature className="h-3 w-3" /> Customer signature
            </p>
            <div className="h-12 w-36 rounded border bg-white dark:bg-white/10 p-1">
              <img
                src={delivery.signatureUrl}
                alt="Signature"
                className="h-full w-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          </div>
        )}
        {showProofs && delivery.photos.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Camera className="h-3 w-3" /> Delivery photos
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {delivery.photos.map((url, idx) => (
                <div key={idx} className="aspect-square rounded-md overflow-hidden bg-muted border">
                  <img
                    src={url}
                    alt={`Delivery photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InvoicesSection({ invoices }: { invoices: RugInvoiceInfo[] }) {
  if (invoices.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5" />
        Invoices
      </h4>
      <div className="space-y-1.5">
        {invoices.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span className="font-mono text-xs">{inv.invoiceNumber}</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">${inv.total.toFixed(2)}</span>
              <Badge variant="secondary" className={`text-[10px] ${INVOICE_STATUS_STYLE[inv.status] ?? ""}`}>
                {inv.status}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RugContextPanel({ rugId, showDeliveryProofs = false }: RugContextPanelProps) {
  const { data, isLoading } = useRugContext(rugId);

  if (isLoading) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5 py-2">
        <Clock className="h-3 w-3 animate-spin" /> Loading delivery & invoice info...
      </p>
    );
  }

  if (!data) return null;

  const hasContent = data.delivery || data.invoices.length > 0;
  if (!hasContent) return null;

  return (
    <div className="space-y-4">
      {data.delivery && <DeliverySection delivery={data.delivery} showProofs={showDeliveryProofs} />}
      <InvoicesSection invoices={data.invoices} />
    </div>
  );
}
