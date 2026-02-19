import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MOCK_INVOICES } from "@/data/mock-invoices";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Download } from "lucide-react";

const CLIENT_ID = "client-3";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  sent: "default",
  paid: "secondary",
  overdue: "destructive",
  draft: "outline",
};

export default function PortalInvoicesTab() {
  const { toast } = useToast();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const invoices = MOCK_INVOICES.filter((inv) => inv.clientId === CLIENT_ID);

  return (
    <div className="rounded-lg border bg-background divide-y">
      {/* Header */}
      <div className="hidden sm:grid grid-cols-[1fr_80px_60px_80px_80px_40px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <span>Invoice</span>
        <span>Date</span>
        <span>Rugs</span>
        <span className="text-right">Total</span>
        <span>Status</span>
        <span />
      </div>

      {invoices.map((inv) => {
        const isExpanded = expandedRow === inv.id;
        return (
          <div key={inv.id}>
            <button
              onClick={() => setExpandedRow(isExpanded ? null : inv.id)}
              className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_80px_60px_80px_80px_40px] gap-2 items-center px-4 py-3 text-left hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
                <span className="text-sm font-medium">{inv.invoiceNumber}</span>
              </div>
              <span className="text-sm text-muted-foreground hidden sm:block">
                {new Date(inv.date).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
              </span>
              <span className="text-sm hidden sm:block">{inv.rugCount}</span>
              <span className="text-sm font-medium text-right hidden sm:block">${inv.totalAmount.toLocaleString()}</span>
              <Badge variant={STATUS_VARIANT[inv.status] ?? "outline"} className="text-[11px] w-fit">
                {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
              </Badge>
              <div className="hidden sm:flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast({ title: "Download started", description: `${inv.invoiceNumber}.pdf` });
                  }}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            </button>
            {isExpanded && (
              <div className="px-4 pb-3 pl-10 space-y-1 border-t bg-muted/20">
                <div className="pt-2 space-y-1">
                  {inv.lineItems.map((li, i) => (
                    <div key={i} className="flex justify-between text-sm max-w-md">
                      <span>
                        <span className="font-medium">{li.rugNumber}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{li.services.join(", ")}</span>
                      </span>
                      <span className="tabular-nums">${li.subtotal.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                {inv.notes && (
                  <p className="text-xs text-muted-foreground italic pt-1">{inv.notes}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
