import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { usePortalClient } from "@/hooks/usePortalClient";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { downloadInvoicePdf } from "@/lib/invoice-artifacts";

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";
type PaymentAttemptStatus = "pending" | "succeeded" | "failed";

const PAGE_SIZE = 50;

type InvoiceLookup = {
  id: string;
  client_id: string;
  invoice_number: string;
  status: InvoiceStatus;
  total: number;
  issued_at: string | null;
  due_at: string | null;
  created_at: string;
  pdf_storage_path: string | null;
};

type InvoiceItemLookup = {
  id: string;
  invoice_id: string;
  description: string;
  total: number;
  rugs: { tag: string | null } | null;
};

type PaymentAttemptLookup = {
  id: string;
  invoice_id: string;
  status: PaymentAttemptStatus;
  amount: number;
  attempted_at: string;
  provider: string;
  error_message: string | null;
};

type PortalInvoicePaymentAttempt = {
  id: string;
  status: PaymentAttemptStatus;
  amount: number;
  attemptedAt: string;
  provider: string;
  errorMessage: string | null;
};

type PortalInvoice = {
  id: string;
  clientId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  totalAmount: number;
  date: string;
  dueAt: string | null;
  pdfStoragePath: string | null;
  lineItems: { key: string; rugNumber: string; description: string; subtotal: number }[];
  paymentAttempts: PortalInvoicePaymentAttempt[];
};

const STATUS_VARIANT: Record<InvoiceStatus, "default" | "secondary" | "outline" | "destructive"> = {
  sent: "default",
  paid: "secondary",
  overdue: "destructive",
  draft: "outline",
};

const PAYMENT_STATUS_STYLE: Record<PaymentAttemptStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  succeeded: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function PortalInvoicesTab() {
  const { toast } = useToast();
  const { clientId, loading: portalClientLoading, errorMessage } = usePortalClient();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [paymentHistoryError, setPaymentHistoryError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);

  const fetchInvoicesPage = useCallback(async (activeClientId: string, targetPageIndex: number, append: boolean) => {
      const from = targetPageIndex * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data: invoiceRows, error: invoiceError } = await supabase
        .from("invoices")
        .select("id, client_id, invoice_number, status, total, issued_at, due_at, created_at, pdf_storage_path")
        .eq("client_id", activeClientId)
        .order("issued_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, to)
        .returns<InvoiceLookup[]>();

      if (invoiceError) {
        toast({ title: "Failed to load invoices", description: invoiceError.message, variant: "destructive" });
        if (!append) {
          setInvoices([]);
        }
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

      const { data: paymentRows, error: paymentError } = invoiceIds.length
        ? await supabase
            .from("payment_attempts")
            .select("id, invoice_id, status, amount, attempted_at, provider, error_message")
            .in("invoice_id", invoiceIds)
            .order("attempted_at", { ascending: false })
            .returns<PaymentAttemptLookup[]>()
        : { data: [], error: null };

      if (paymentError) {
        setPaymentHistoryError(paymentError.message);
      } else {
        setPaymentHistoryError(null);
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
        const paymentAttempts = (paymentRows ?? [])
          .filter((attempt) => attempt.invoice_id === invoice.id)
          .map((attempt) => ({
            id: attempt.id,
            status: attempt.status,
            amount: Number(attempt.amount ?? 0),
            attemptedAt: attempt.attempted_at,
            provider: attempt.provider,
            errorMessage: attempt.error_message,
          }));

        return {
          id: invoice.id,
          clientId: invoice.client_id,
          invoiceNumber: invoice.invoice_number,
          status: invoice.status,
          totalAmount: Number(invoice.total ?? 0),
          date: invoice.issued_at ?? invoice.created_at,
          dueAt: invoice.due_at,
          pdfStoragePath: invoice.pdf_storage_path,
          lineItems,
          paymentAttempts,
        };
      });

      setHasMore((invoiceRows ?? []).length === PAGE_SIZE);
      setPageIndex(targetPageIndex);
      setInvoices((prev) => {
        if (!append) {
          return nextInvoices;
        }
        const byId = new Map(prev.map((invoice) => [invoice.id, invoice]));
        for (const invoice of nextInvoices) {
          byId.set(invoice.id, invoice);
        }
        return Array.from(byId.values());
      });
  }, [toast]);

  useEffect(() => {
    if (portalClientLoading) {
      setLoading(true);
      return;
    }

    if (errorMessage) {
      toast({ title: "No portal access", description: errorMessage, variant: "destructive" });
      setInvoices([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    if (!clientId) {
      setInvoices([]);
      setHasMore(false);
      setLoading(false);
      return;
    }

    const loadInitial = async () => {
      setLoading(true);
      setExpandedRow(null);
      await fetchInvoicesPage(clientId, 0, false);
      setLoading(false);
    };

    loadInitial();
  }, [clientId, errorMessage, fetchInvoicesPage, portalClientLoading, toast]);

  const loadOlderInvoices = async () => {
    if (!clientId || loadingMore || !hasMore) {
      return;
    }
    setLoadingMore(true);
    await fetchInvoicesPage(clientId, pageIndex + 1, true);
    setLoadingMore(false);
  };

  const handleDownload = async (invoice: PortalInvoice, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    try {
      const artifact = await downloadInvoicePdf({
        invoiceNumber: invoice.invoiceNumber,
        pdfStoragePath: invoice.pdfStoragePath,
      });
      toast({
        title: "Invoice download started",
        description: `${invoice.invoiceNumber}.pdf (${artifact.bucket}/${artifact.path})`,
      });

      const { error: eventError } = await supabaseExtended.from("communication_events").insert({
        client_id: invoice.clientId,
        invoice_id: invoice.id,
        channel: "in_app_chat",
        direction: "inbound",
        event_type: "invoice_pdf_downloaded_by_client",
        subject: `${invoice.invoiceNumber} downloaded`,
        body: `Portal client downloaded ${invoice.invoiceNumber}.pdf from ${artifact.path}.`,
      });

      if (eventError) {
        toast({
          title: "Download completed with warning",
          description: `Activity log update failed: ${eventError.message}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      const description = error instanceof Error ? error.message : "Unknown error";
      toast({
        title: "Invoice download failed",
        description,
        variant: "destructive",
      });
    }
  };

  const emptyState = useMemo(() => !loading && invoices.length === 0, [loading, invoices.length]);

  if (portalClientLoading || loading) {
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
                  onClick={(event) => handleDownload(inv, event)}
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </div>
            </button>
            {isExpanded && (
              <div className="px-4 pb-3 pl-10 space-y-4 border-t bg-muted/20">
                <div className="pt-2 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Line items</p>
                  {inv.lineItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No line items found.</p>
                  ) : (
                    inv.lineItems.map((li) => (
                      <div key={li.key} className="flex justify-between text-sm max-w-md gap-4">
                        <span>
                          <span className="font-medium">{li.rugNumber}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{li.description || "Service"}</span>
                        </span>
                        <span className="tabular-nums">${li.subtotal.toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment attempts</p>
                    {paymentHistoryError ? (
                      <span className="text-xs text-destructive">Unable to refresh payments ({paymentHistoryError})</span>
                    ) : null}
                  </div>
                  {inv.paymentAttempts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No payment attempts recorded yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {inv.paymentAttempts.map((attempt) => (
                        <div
                          key={attempt.id}
                          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm max-w-lg rounded-md border bg-background px-2.5 py-1.5"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className={PAYMENT_STATUS_STYLE[attempt.status]}>
                              {attempt.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(attempt.attemptedAt).toLocaleString("en-US", {
                                month: "numeric",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <span className="font-medium tabular-nums">${attempt.amount.toFixed(2)}</span>
                          {attempt.errorMessage ? (
                            <span className="basis-full text-xs text-destructive">{attempt.errorMessage}</span>
                          ) : (
                            <span className="basis-full text-xs text-muted-foreground">Provider: {attempt.provider}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {hasMore ? (
        <div className="flex justify-center border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={loadOlderInvoices} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load older invoices"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
