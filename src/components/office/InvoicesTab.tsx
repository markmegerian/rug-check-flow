import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, Plus } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { toast } from "@/hooks/use-toast";
import { downloadInvoicePdf } from "@/lib/invoice-artifacts";
import { InvoiceFilters } from "@/components/office/InvoiceFilters";
import { InvoiceDetailSheet } from "@/components/office/InvoiceDetailSheet";
import { InvoiceCreateSheet } from "@/components/office/InvoiceCreateSheet";
import { LoadingState } from "@/components/states/PageState";
import { useInvoices, useInvalidateInvoices, type InvoiceRow } from "@/hooks/useInvoices";
import { InvoiceStatusBadge, type InvoiceStatus } from "@/components/shared/StatusBadge";
import { MS_PER_DAY } from "@/lib/constants";
import { calculateInvoiceDueDate } from "@/lib/billing";
import { openOrCreateThread } from "@/lib/thread-navigation";

const STATUSES: Array<{ value: string; label: string }> = [
  { value: "outstanding", label: "Outstanding" },
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];
const STATUS_VALUES = new Set(STATUSES.map((status) => status.value));


export function InvoicesTab() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    data: infiniteData,
    isLoading: loading,
    hasNextPage,
    isFetchingNextPage: loadingMore,
    fetchNextPage,
  } = useInvoices();
  const invalidateInvoices = useInvalidateInvoices();

  const invoices = useMemo(
    () => infiniteData?.pages.flat() ?? [],
    [infiniteData],
  );

  const [activeTab, setActiveTab] = useState("outstanding");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [clientSearch, setClientSearch] = useState("");
  const [selected, setSelected] = useState<InvoiceRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const queryStatus = searchParams.get("status");
  const minAgeDays = Number(searchParams.get("minAgeDays") ?? 0);
  const hasReminderFilter = STATUS_VALUES.has(queryStatus ?? "") || minAgeDays > 0;

  useEffect(() => {
    if (queryStatus && STATUS_VALUES.has(queryStatus)) setActiveTab(queryStatus);
  }, [queryStatus]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: invoices.length };
    counts.outstanding = invoices.filter((inv) => ["draft", "sent", "overdue"].includes(inv.status)).length;
    for (const inv of invoices) counts[inv.status] = (counts[inv.status] || 0) + 1;
    return counts;
  }, [invoices]);

  const filtered = useMemo(() => {
    let list: typeof invoices;
    if (activeTab === "outstanding") {
      list = invoices.filter((inv) => ["draft", "sent", "overdue"].includes(inv.status));
    } else if (activeTab === "all") {
      list = invoices;
    } else {
      list = invoices.filter((inv) => inv.status === activeTab);
    }
    if (minAgeDays > 0) {
      list = list.filter((inv) => {
        const ageMs = Date.now() - Date.parse(inv.due_at ?? inv.created_at);
        return Number.isFinite(ageMs) && ageMs >= minAgeDays * MS_PER_DAY;
      });
    }
    if (dateFrom) {
      const fromStr = format(dateFrom, "yyyy-MM-dd");
      list = list.filter((inv) => inv.created_at.slice(0, 10) >= fromStr);
    }
    if (dateTo) {
      const toStr = format(dateTo, "yyyy-MM-dd");
      list = list.filter((inv) => inv.created_at.slice(0, 10) <= toStr);
    }
    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase();
      list = list.filter((inv) => (inv.clients?.name ?? "").toLowerCase().includes(q));
    }
    // Outstanding/overdue: oldest first. Otherwise: newest first.
    if (activeTab === "outstanding" || activeTab === "overdue") {
      return [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [invoices, activeTab, dateFrom, dateTo, clientSearch, minAgeDays]);

  const clientOpenInvoices = useMemo(() => {
    if (!selected?.client_id) return [];
    return invoices.filter(
      (inv) => inv.client_id === selected.client_id && ["sent", "overdue"].includes(inv.status)
    );
  }, [invoices, selected?.client_id]);

  const openInvoice = (inv: InvoiceRow) => {
    setSelected(inv);
    setSheetOpen(true);
  };

  const openInvoiceThread = useCallback(async (invoice: InvoiceRow) => {
    if (!invoice.client_id) {
      toast({ title: "No client linked", description: "This invoice does not have a client to message.", variant: "destructive" });
      return;
    }

    try {
      const threadId = await openOrCreateThread({
        clientId: invoice.client_id,
        threadType: "invoice",
        entityId: invoice.id,
      });
      navigate(`/operations?tab=inbox&threadId=${threadId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Could not open thread", description: message, variant: "destructive" });
    }
  }, [navigate]);

  useEffect(() => {
    if (!selected?.id) return;
    const updated = invoices.find((i) => i.id === selected.id);
    if (updated) setSelected(updated);
  }, [invoices, selected?.id]);

  const logInvoiceEvent = useCallback(async (
    invoice: InvoiceRow,
    eventType: string,
    subject: string,
    body: string,
  ) => {
    await supabaseExtended.from("communication_events").insert({
      client_id: invoice.client_id,
      invoice_id: invoice.id,
      channel: "in_app_chat",
      direction: "outbound",
      event_type: eventType,
      subject,
      body,
    });
  }, []);

  const updateStatus = async (newStatus: InvoiceStatus) => {
    if (!selected) return;
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === "sent") {
      const issuedAt = new Date();
      updates.issued_at = issuedAt.toISOString();
      if (selected.client_id) {
        const { data: clientProfile, error: clientError } = await supabase
          .from("clients")
          .select("invoice_terms_days")
          .eq("id", selected.client_id)
          .maybeSingle();
        if (clientError) {
          toast({ title: "Billing profile lookup failed", description: clientError.message, variant: "destructive" });
          return;
        }
        updates.due_at = calculateInvoiceDueDate(issuedAt, clientProfile?.invoice_terms_days);
      }
    }
    if (newStatus === "paid") updates.paid_at = new Date().toISOString();

    const { error } = await supabase.from("invoices").update(updates).eq("id", selected.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }

    if (newStatus === "sent") {
      const { data: pdfData, error: pdfError } = await supabase.functions.invoke("invoice-pdf", {
        body: { invoice_id: selected.id, force_regenerate: true },
      });
      if (pdfError || pdfData?.error) {
        toast({ title: "Invoice marked sent with warning", description: pdfData?.error ?? pdfError?.message ?? "Failed to prepare PDF artifact.", variant: "destructive" });
      }
    }

    await logInvoiceEvent(selected, `invoice_marked_${newStatus}`, `${selected.invoice_number} marked ${newStatus}`, `Office marked invoice ${selected.invoice_number} as ${newStatus}.`);
    toast({ title: `Marked as ${newStatus}` });
    invalidateInvoices();
  };

  const deleteDraft = async () => {
    if (!selected) return;
    await supabase.from("invoice_items").delete().eq("invoice_id", selected.id);
    const { error } = await supabase.from("invoices").delete().eq("id", selected.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setSheetOpen(false);
    setSelected(null);
    toast({ title: "Draft deleted" });
    invalidateInvoices();
  };

  const handleDownloadInvoice = async (invoice: InvoiceRow) => {
    try {
      const artifact = await downloadInvoicePdf({ invoiceId: invoice.id, invoiceNumber: invoice.invoice_number });
      toast({ title: "Invoice download started", description: `${invoice.invoice_number}.pdf (${artifact.bucket}/${artifact.path})` });
    } catch (error) {
      toast({ title: "Download failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleSavePayment = async (params: { method: string; reference: string; receivedAt: string; allocations: Record<string, string> }) => {
    if (!selected?.client_id) return;
    const totalAllocated = Object.values(params.allocations).reduce((sum, v) => sum + (Number(v) || 0), 0);
    if (totalAllocated <= 0) return;

    // payments table may not be in auto-generated types
    const { data: payment, error: paymentError } = await supabase
      .from("payments" as "invoices")
      .insert({
        client_id: selected.client_id,
        amount: totalAllocated,
        method: params.method,
        reference: params.reference || null,
        received_at: `${params.receivedAt}T00:00:00.000Z`,
        status: "succeeded",
        job_id: null,
      } as Record<string, unknown> as never)
      .select("id")
      .single();

    if (paymentError || !payment?.id) {
      toast({ title: "Payment failed", description: paymentError?.message, variant: "destructive" });
      return;
    }

    const rows = Object.entries(params.allocations)
      .map(([invoiceId, amount]) => ({ payment_id: payment.id, invoice_id: invoiceId, amount: Number(amount) || 0 }))
      .filter((row) => row.amount > 0);

    const { error: allocationError } = await supabase.from("payment_allocations" as "invoices").insert(rows as never);
    if (allocationError) {
      toast({ title: "Allocation failed", description: allocationError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Payment recorded", description: `Allocated $${totalAllocated.toFixed(2)} across ${rows.length} invoice(s).` });
    invalidateInvoices();
  };

  const handleIssueCreditMemo = async (reason: string, amount: string) => {
    if (!selected?.id) return;
    const normalized = Math.abs(Number(amount) || 0);
    if (!reason.trim() || normalized <= 0) return;

    const { data: memo, error: memoError } = await supabase
      .from("credit_memos" as "invoices")
      .insert({ invoice_id: selected.id, reason: reason.trim() } as Record<string, unknown> as never)
      .select("id")
      .single();

    if (memoError || !memo?.id) {
      toast({ title: "Credit memo failed", description: memoError?.message, variant: "destructive" });
      return;
    }

    const { error: lineError } = await supabase.from("credit_memo_lines" as "invoices").insert({
      credit_memo_id: memo.id,
      description: reason.trim(),
      amount: -normalized,
    } as Record<string, unknown> as never);
    if (lineError) {
      toast({ title: "Credit line failed", description: lineError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Credit memo issued", description: `Applied -$${normalized.toFixed(2)} to ${selected.invoice_number}.` });
    invalidateInvoices();
  };

  const clientName = (inv: InvoiceRow) => inv.clients?.name ?? "Unknown";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingState title="Loading invoices" description="Fetching invoice records..." />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 overflow-auto h-full space-y-6 animate-fade-in-up">
      {hasReminderFilter && (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Reminder filter active:
          {queryStatus ? ` status=${queryStatus}` : ""}
          {minAgeDays > 0 ? ` · min age ${minAgeDays} days` : ""}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {STATUSES.map((s) => (
              <TabsTrigger key={s.value} value={s.value} className="gap-1.5">
                {s.label}
                {(statusCounts[s.value] ?? 0) > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">
                    {statusCounts[s.value]}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> New Invoice
        </Button>
      </div>

      <InvoiceFilters
        clientSearch={clientSearch}
        onClientSearchChange={setClientSearch}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice #</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="hidden sm:table-cell">Date</TableHead>
            <TableHead className="w-16 text-center">Items</TableHead>
            <TableHead className="w-28 text-right">Total</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No invoices
              </TableCell>
            </TableRow>
          ) : (
            filtered.map((inv) => (
              <TableRow key={inv.id} className="cursor-pointer" onClick={() => openInvoice(inv)}>
                <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                <TableCell>{clientName(inv)}</TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {inv.created_at.slice(0, 10)}
                </TableCell>
                <TableCell className="text-center">{inv.invoice_items.length}</TableCell>
                <TableCell className="text-right font-medium">
                  ${Number(inv.total).toFixed(2)}
                </TableCell>
                <TableCell>
                  <InvoiceStatusBadge status={inv.status} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void openInvoiceThread(inv); }}>
                      Thread
                    </Button>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openInvoice(inv); }}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Showing {invoices.length} most recent invoices.</span>
        {hasNextPage && (
          <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={loadingMore}>
            {loadingMore ? "Loading\u2026" : "Load older invoices"}
          </Button>
        )}
      </div>

      <InvoiceDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        invoice={selected}
        clientOpenInvoices={clientOpenInvoices}
        onUpdateStatus={updateStatus}
        onDeleteDraft={deleteDraft}
        onDownloadPdf={handleDownloadInvoice}
        onSavePayment={handleSavePayment}
        onIssueCreditMemo={handleIssueCreditMemo}
      />

      <InvoiceCreateSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={invalidateInvoices}
      />
    </div>
  );
}
