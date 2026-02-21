import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { usePortalClient } from "@/hooks/usePortalClient";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

type PortalUserLookup = {
  client_id: string;
};

type InvoiceLookup = {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  total: number;
  issued_at: string | null;
  due_at: string | null;
  created_at: string;
};

type InvoiceItemLookup = {
  id: string;
  invoice_id: string;
  description: string;
  total: number;
  rugs: { tag: string | null } | null;
};

type PortalInvoice = {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  totalAmount: number;
  date: string;
  dueAt: string | null;
  lineItems: { key: string; rugNumber: string; description: string; subtotal: number }[];
};

const STATUS_VARIANT: Record<InvoiceStatus, "default" | "secondary" | "outline" | "destructive"> = {
  sent: "default",
  paid: "secondary",
  overdue: "destructive",
  draft: "outline",
};

export default function PortalInvoicesTab() {
  const { toast } = useToast();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);

    try {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email?.toLowerCase();

      if (!email) {
        toast({ title: "Portal account required", description: "Please sign in again.", variant: "destructive" });
        setInvoices([]);
        return;
      }

      const { data: portalUser, error: portalError } = await supabase
        .from("portal_users")
        .select("client_id")
        .eq("email", email)
        .eq("status", "active")
        .maybeSingle<PortalUserLookup>();

      if (portalError || !portalUser?.client_id) {
        toast({ title: "No portal access", description: "Your account is not linked to an active client portal user.", variant: "destructive" });
        setInvoices([]);
        return;
      }

      const { data: invoiceRows, error: invoiceError } = await supabase
        .from("invoices")
        .select("id, invoice_number, status, total, issued_at, due_at, created_at")
        .eq("client_id", portalUser.client_id)
        .order("issued_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(200)
        .returns<InvoiceLookup[]>();

      if (invoiceError) {
        toast({ title: "Failed to load invoices", description: invoiceError.message, variant: "destructive" });
        setInvoices([]);
        return;
      }

      const invoiceIds = (invoiceRows ?? []).map((row) => row.id);

      const { data: itemRows, error: itemError } = invoiceIds.length
        ? await supabase
            .from("invoice_items")
            .select("id, invoice_id, description, total, rugs(tag)")
            .in("invoice_id", invoiceIds)
            .returns<InvoiceItemLookup[]>()
        : { data: [], error: null };

      if (itemError) {
        toast({ title: "Failed to load invoice items", description: itemError.message, variant: "destructive" });
        setInvoices([]);
        return;
      }

      const nextInvoices: PortalInvoice[] = (invoiceRows ?? []).map((invoice) => {
        const lineItems = (itemRows ?? [])
          .filter((item) => item.invoice_id === invoice.id)
          .map((item) => ({
            key: item.id,
            rugNumber: item.rugs?.tag ?? "—",
            description: item.description,
            subtotal: Number(item.total ?? 0),
          }));

        return {
          id: invoice.id,
          invoiceNumber: invoice.invoice_number,
          status: invoice.status,
          totalAmount: Number(invoice.total ?? 0),
          date: invoice.issued_at ?? invoice.created_at,
          dueAt: invoice.due_at,
          lineItems,
        };
      });

      setInvoices(nextInvoices);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const emptyState = useMemo(() => !loading && invoices.length === 0, [loading, invoices.length]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading invoices…</div>;
  }

  if (emptyState) {
    return <div className="text-sm text-muted-foreground">No invoices available yet.</div>;
  }

  return (
    <div className="rounded-lg border bg-background divide-y">
      <div className="hidden sm:grid grid-cols-[1fr_90px_70px_90px_80px_40px] gap-2 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
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
              className="w-full grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_90px_70px_90px_80px_40px] gap-2 items-center px-4 py-3 text-left hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
                <div>
                  <span className="text-sm font-medium block">{inv.invoiceNumber}</span>
                  {inv.dueAt && (
                    <span className="text-xs text-muted-foreground">Due {new Date(inv.dueAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span>
                  )}
                </div>
              </div>
              <span className="text-sm text-muted-foreground hidden sm:block">
                {new Date(inv.date).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
              </span>
              <span className="text-sm hidden sm:block">{inv.lineItems.length}</span>
              <span className="text-sm font-medium text-right hidden sm:block">${inv.totalAmount.toLocaleString()}</span>
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
                    toast({ title: "Download not configured", description: `${inv.invoiceNumber}.pdf is not yet available.` });
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
                    <div key={li.key} className="flex justify-between text-sm max-w-md gap-4">
                      <span>
                        <span className="font-medium">{li.rugNumber}</span>
                        <span className="text-muted-foreground ml-2 text-xs">{li.description || "Service"}</span>
                      </span>
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
