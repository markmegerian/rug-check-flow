import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type InvoiceStatus = Tables<"invoices">["status"];

type PortalInvoice = {
  id: string;
  invoiceNumber: string;
  date: string;
  status: InvoiceStatus;
  totalAmount: number;
  lineItems: Array<{
    id: string;
    description: string;
    subtotal: number;
  }>;
};

const STATUS_VARIANT: Record<InvoiceStatus, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  sent: "default",
  paid: "secondary",
  overdue: "destructive",
};

export default function PortalInvoicesTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setAccessError(null);

    const { data: authData } = await supabase.auth.getUser();
    const email = authData.user?.email?.toLowerCase();
    if (!email) {
      setAccessError("Portal account required. Please sign in again.");
      setLoading(false);
      return;
    }

    const { data: portalUser, error: portalError } = await supabase
      .from("portal_users")
      .select("client_id")
      .eq("email", email)
      .eq("status", "active")
      .maybeSingle();

    if (portalError) {
      toast({ title: "Failed to load portal profile", description: portalError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    if (!portalUser?.client_id) {
      setAccessError("No active portal access was found for your account.");
      setLoading(false);
      return;
    }

    const { data: invoiceRows, error: invoicesError } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, total, created_at, invoice_items(id, description, total)")
      .eq("client_id", portalUser.client_id)
      .order("created_at", { ascending: false });

    if (invoicesError) {
      toast({ title: "Failed to load invoices", description: invoicesError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const mapped = (invoiceRows ?? []).map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      date: invoice.created_at,
      status: invoice.status,
      totalAmount: Number(invoice.total ?? 0),
      lineItems: (invoice.invoice_items ?? []).map((lineItem) => ({
        id: lineItem.id,
        description: lineItem.description,
        subtotal: Number(lineItem.total ?? 0),
      })),
    }));

    setInvoices(mapped);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading invoices...</p>;
  }

  if (accessError) {
    return <p className="text-sm text-muted-foreground">{accessError}</p>;
  }

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

      {invoices.length === 0 && (
        <div className="px-4 py-6 text-sm text-muted-foreground">No invoices found.</div>
      )}

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
              <span className="text-sm hidden sm:block">{inv.lineItems.length}</span>
              <span className="text-sm font-medium text-right hidden sm:block">${inv.totalAmount.toFixed(2)}</span>
              <Badge variant={STATUS_VARIANT[inv.status]} className="text-[11px] w-fit">
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
                  {inv.lineItems.map((li) => (
                    <div key={li.id} className="flex justify-between text-sm max-w-md gap-2">
                      <span className="font-medium">{li.description}</span>
                      <span className="tabular-nums">${li.subtotal.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
