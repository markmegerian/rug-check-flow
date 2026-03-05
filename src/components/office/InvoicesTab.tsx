import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, Download, Send, Trash2, DollarSign, AlertTriangle, Loader2, Plus, CalendarIcon, X, Search } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Tables } from "@/integrations/supabase/types";
import { downloadInvoicePdf } from "@/lib/invoice-artifacts";

type InvoiceRow = Tables<"invoices"> & {
  pdf_storage_path: string | null;
  clients: { name: string } | null;
  invoice_items: Tables<"invoice_items">[];
};

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const STATUSES: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
];
const STATUS_VALUES = new Set(STATUSES.map((status) => status.value));

const PAGE_SIZE = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ClientOption {
  id: string;
  name: string;
  pricing_tier: string;
}

interface RugOption {
  id: string;
  tag: string;
  size_length: number | null;
  size_width: number | null;
  rug_services: { service_id: string; unit_price: number; line_total: number; services: { name: string } | null }[];
}

type ClientRugRow = Pick<Tables<"rugs">, "id" | "tag" | "size_length" | "size_width"> & {
  rug_services: { service_id: string; unit_price: number; line_total: number; services: { name: string } | null }[];
};

export function InvoicesTab() {
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [clientSearch, setClientSearch] = useState("");
  const [selected, setSelected] = useState<InvoiceRow | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentReceivedAt, setPaymentReceivedAt] = useState(format(new Date(), "yyyy-MM-dd"));
  const [allocationSearch, setAllocationSearch] = useState("");
  const [paymentAllocations, setPaymentAllocations] = useState<Record<string, string>>({});
  const [savingPayment, setSavingPayment] = useState(false);
  const [creditReason, setCreditReason] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [savingCredit, setSavingCredit] = useState(false);

  // Create flow state
  const [createOpen, setCreateOpen] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientRugs, setClientRugs] = useState<RugOption[]>([]);
  const [selectedRugIds, setSelectedRugIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const queryStatus = searchParams.get("status");
  const minAgeDays = Number(searchParams.get("minAgeDays") ?? 0);
  const hasReminderFilter = STATUS_VALUES.has(queryStatus ?? "") || minAgeDays > 0;

  const fetchInvoicesPage = useCallback(async (targetPageIndex: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    const from = targetPageIndex * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("invoices")
      .select("*, pdf_storage_path, clients(name), invoice_items(*)")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      toast({ title: "Error loading invoices", description: error.message, variant: "destructive" });
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
      return;
    }

    const nextRows = (data as InvoiceRow[]) ?? [];
    setHasMore(nextRows.length === PAGE_SIZE);
    setPageIndex(targetPageIndex);
    setInvoices((prev) => {
      if (!append) return nextRows;
      const byId = new Map(prev.map((invoice) => [invoice.id, invoice]));
      for (const invoice of nextRows) {
        byId.set(invoice.id, invoice);
      }
      return Array.from(byId.values());
    });

    if (append) {
      setLoadingMore(false);
    } else {
      setLoading(false);
    }
  }, []);

  const refreshInvoices = useCallback(async () => {
    await fetchInvoicesPage(0, false);
  }, [fetchInvoicesPage]);

  useEffect(() => {
    refreshInvoices();
  }, [refreshInvoices]);

  useEffect(() => {
    if (queryStatus && STATUS_VALUES.has(queryStatus)) {
      setActiveTab(queryStatus);
    }
  }, [queryStatus]);

  // Fetch clients for create flow
  const openCreate = async () => {
    const { data } = await supabase.from("clients").select("id, name, pricing_tier").order("name");
    setClients(data ?? []);
    setSelectedClientId("");
    setClientRugs([]);
    setSelectedRugIds(new Set());
    setCreateOpen(true);
  };

  // When client changes, fetch their checked-in rugs
  useEffect(() => {
    if (!selectedClientId) {
      setClientRugs([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("rugs")
        .select("id, tag, size_length, size_width, rug_services(service_id, unit_price, line_total, services(name))")
        .eq("client_id", selectedClientId)
        .in("status", ["checked_in", "in_production", "ready"])
        .order("checked_in_at", { ascending: false })
        .returns<ClientRugRow[]>();
      setClientRugs(data ?? []);
      setSelectedRugIds(new Set());
    })();
  }, [selectedClientId]);

  // No longer need separate service price lookup — prices come from rug_services snapshots

  const toggleRug = (rugId: string) => {
    setSelectedRugIds((prev) => {
      const next = new Set(prev);
      if (next.has(rugId)) next.delete(rugId);
      else next.add(rugId);
      return next;
    });
  };

  const computeLineItems = useCallback(() => {
    return clientRugs
      .filter((r) => selectedRugIds.has(r.id))
      .flatMap((rug) => {
        return (rug.rug_services ?? []).map((rs) => ({
          rug_id: rug.id,
          description: `${rs.services?.name ?? "Service"} — ${rug.tag}`,
          quantity: 1,
          unit_price: Number(rs.line_total),
          total: Number(rs.line_total),
        }));
      });
  }, [clientRugs, selectedRugIds]);

  const draftTotal = useMemo(() => {
    return computeLineItems().reduce((sum, li) => sum + li.total, 0);
  }, [computeLineItems]);

  const createDraft = async () => {
    if (!selectedClientId || selectedRugIds.size === 0) return;
    setCreating(true);

    const invNum = `INV-${Date.now().toString(36).toUpperCase()}`;
    const lineItems = computeLineItems();
    const total = lineItems.reduce((s, li) => s + li.total, 0);

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invNum,
        client_id: selectedClientId,
        status: "draft" as const,
        total,
        pdf_storage_path: `clients/${selectedClientId}/${invNum}.pdf`,
      })
      .select()
      .single();

    if (invErr || !inv) {
      toast({ title: "Error creating invoice", description: invErr?.message, variant: "destructive" });
      setCreating(false);
      return;
    }

    const rows = lineItems.map((li) => ({ ...li, invoice_id: inv.id }));
    const { error: itemsErr } = await supabase.from("invoice_items").insert(rows);
    if (itemsErr) {
      toast({ title: "Error adding line items", description: itemsErr.message, variant: "destructive" });
    }

    toast({ title: `Draft ${invNum} created` });
    setCreateOpen(false);
    setCreating(false);
    await refreshInvoices();
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: invoices.length };
    for (const inv of invoices) {
      counts[inv.status] = (counts[inv.status] || 0) + 1;
    }
    return counts;
  }, [invoices]);

  const filtered = useMemo(() => {
    let list = activeTab === "all" ? invoices : invoices.filter((inv) => inv.status === activeTab);
    if (minAgeDays > 0) {
      list = list.filter((inv) => {
        const ageSource = inv.due_at ?? inv.created_at;
        const ageMs = Date.now() - Date.parse(ageSource);
        if (!Number.isFinite(ageMs)) return false;
        return ageMs >= minAgeDays * MS_PER_DAY;
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
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [invoices, activeTab, dateFrom, dateTo, clientSearch, minAgeDays]);

  const openInvoice = (inv: InvoiceRow) => {
    setSelected(inv);
    setPaymentAllocations({ [inv.id]: Number(inv.total).toFixed(2) });
    setAllocationSearch("");
    setCreditReason("");
    setCreditAmount("");
    setSheetOpen(true);
  };

  const selectedClientOpenInvoices = useMemo(() => {
    if (!selected?.client_id) return [];
    const query = allocationSearch.trim().toLowerCase();
    return invoices
      .filter((invoice) => invoice.client_id === selected.client_id && ["sent", "overdue"].includes(invoice.status))
      .filter((invoice) => !query || invoice.invoice_number.toLowerCase().includes(query));
  }, [allocationSearch, invoices, selected?.client_id]);

  const totalAllocated = useMemo(() => Object.values(paymentAllocations)
    .reduce((sum, value) => sum + (Number(value) || 0), 0), [paymentAllocations]);

  const savePayment = async () => {
    if (!selected?.client_id || totalAllocated <= 0) return;
    setSavingPayment(true);
    const { data: payment, error: paymentError } = await (supabase as any)
      .from("payments")
      .insert({
        client_id: selected.client_id,
        amount: totalAllocated,
        method: paymentMethod,
        reference: paymentReference || null,
        received_at: `${paymentReceivedAt}T00:00:00.000Z`,
        status: "succeeded",
        job_id: null,
      })
      .select("id")
      .single();

    if (paymentError || !payment?.id) {
      toast({ title: "Payment failed", description: paymentError?.message, variant: "destructive" });
      setSavingPayment(false);
      return;
    }

    const rows = Object.entries(paymentAllocations)
      .map(([invoiceId, amount]) => ({ payment_id: payment.id, invoice_id: invoiceId, amount: Number(amount) || 0 }))
      .filter((row) => row.amount > 0);

    const { error: allocationError } = await (supabase as any).from("payment_allocations").insert(rows);
    if (allocationError) {
      toast({ title: "Allocation failed", description: allocationError.message, variant: "destructive" });
      setSavingPayment(false);
      return;
    }

    toast({ title: "Payment recorded", description: `Allocated $${totalAllocated.toFixed(2)} across ${rows.length} invoice(s).` });
    setPaymentReference("");
    setSavingPayment(false);
    await refreshInvoices();
  };

  const issueCreditMemo = async () => {
    if (!selected?.id) return;
    const normalized = Math.abs(Number(creditAmount) || 0);
    if (!creditReason.trim() || normalized <= 0) return;

    setSavingCredit(true);
    const { data: memo, error: memoError } = await (supabase as any)
      .from("credit_memos")
      .insert({ invoice_id: selected.id, reason: creditReason.trim() })
      .select("id")
      .single();

    if (memoError || !memo?.id) {
      toast({ title: "Credit memo failed", description: memoError?.message, variant: "destructive" });
      setSavingCredit(false);
      return;
    }

    const { error: lineError } = await (supabase as any).from("credit_memo_lines").insert({
      credit_memo_id: memo.id,
      description: creditReason.trim(),
      amount: -normalized,
    });
    if (lineError) {
      toast({ title: "Credit line failed", description: lineError.message, variant: "destructive" });
      setSavingCredit(false);
      return;
    }

    toast({ title: "Credit memo issued", description: `Applied -$${normalized.toFixed(2)} to ${selected.invoice_number}.` });
    setCreditReason("");
    setCreditAmount("");
    setSavingCredit(false);
    await refreshInvoices();
  };

  const logInvoiceEvent = useCallback(async (
    invoice: InvoiceRow,
    eventType: string,
    subject: string,
    body: string,
    direction: "outbound" | "inbound" = "outbound",
  ) => {
    await supabaseExtended.from("communication_events").insert({
      client_id: invoice.client_id,
      invoice_id: invoice.id,
      channel: "in_app_chat",
      direction,
      event_type: eventType,
      subject,
      body,
    });
  }, []);

  const handleDownloadInvoice = async (invoice: InvoiceRow) => {
    try {
      const artifact = await downloadInvoicePdf({
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
      });
      toast({
        title: "Invoice download started",
        description: `${invoice.invoice_number}.pdf (${artifact.bucket}/${artifact.path})`,
      });
    } catch (error) {
      const description = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Download failed", description, variant: "destructive" });
    }
  };

  const updateStatus = async (newStatus: InvoiceStatus) => {
    if (!selected) return;
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === "sent") updates.issued_at = new Date().toISOString();
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
        toast({
          title: "Invoice marked sent with warning",
          description: pdfData?.error ?? pdfError?.message ?? "Failed to prepare PDF artifact.",
          variant: "destructive",
        });
      }
    }

    await logInvoiceEvent(
      selected,
      `invoice_marked_${newStatus}`,
      `${selected.invoice_number} marked ${newStatus}`,
      `Office marked invoice ${selected.invoice_number} as ${newStatus}.`,
    );
    toast({ title: `Marked as ${newStatus}` });
    await refreshInvoices();
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
    await refreshInvoices();
  };

  useEffect(() => {
    if (!selected?.id) return;
    const updated = invoices.find((i) => i.id === selected.id);
    if (updated) setSelected(updated);
  }, [invoices, selected?.id]);

  const loadOlderInvoices = async () => {
    if (!hasMore || loadingMore) return;
    await fetchInvoicesPage(pageIndex + 1, true);
  };

  const rugCount = (inv: InvoiceRow) => inv.invoice_items.length;
  const clientName = (inv: InvoiceRow) => inv.clients?.name ?? "Unknown";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 overflow-auto h-full space-y-6 animate-fade-in-up">
      {hasReminderFilter ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Reminder filter active:
          {queryStatus ? ` status=${queryStatus}` : ""}
          {minAgeDays > 0 ? ` · min age ${minAgeDays} days` : ""}
        </div>
      ) : null}
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
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> New Invoice
        </Button>
      </div>

      {/* Date range filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search client…"
            className="h-8 w-44 pl-8 text-sm"
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-1.5 text-xs", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground">→</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("gap-1.5 text-xs", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="h-3.5 w-3.5" />
              {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

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
                <TableCell className="text-center">{rugCount(inv)}</TableCell>
                <TableCell className="text-right font-medium">
                  ${Number(inv.total).toFixed(2)}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_COLORS[inv.status as InvoiceStatus]} variant="secondary">
                    {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openInvoice(inv); }}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Showing {invoices.length} most recent invoices.</span>
        {hasMore ? (
          <Button variant="outline" size="sm" onClick={loadOlderInvoices} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load older invoices"}
          </Button>
        ) : null}
      </div>

      {/* Invoice Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.invoice_number}</SheetTitle>
                <SheetDescription>{clientName(selected)}</SheetDescription>
              </SheetHeader>

              <div className="space-y-6 py-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Date</span>
                    <p className="font-medium text-foreground">{selected.created_at.slice(0, 10)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p>
                      <Badge className={STATUS_COLORS[selected.status as InvoiceStatus]} variant="secondary">
                        {selected.status.charAt(0).toUpperCase() + selected.status.slice(1)}
                      </Badge>
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">Line Items ({rugCount(selected)})</Label>
                  <div className="border border-border rounded-lg divide-y divide-border text-sm">
                    {selected.invoice_items.map((li) => (
                      <div key={li.id} className="flex items-center justify-between px-3 py-2.5">
                        <div>
                          <span className="font-medium text-foreground">{li.description}</span>
                          <span className="text-muted-foreground ml-2">×{Number(li.quantity)}</span>
                        </div>
                        <span className="font-medium text-foreground">${Number(li.total).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between px-3 py-2 mt-1 font-semibold text-foreground">
                    <span>Total</span>
                    <span>${Number(selected.total).toFixed(2)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Actions</Label>
                  <div className="flex flex-wrap gap-2">
                    {selected.status === "draft" && (
                      <>
                        <Button size="sm" onClick={() => updateStatus("sent")} className="gap-1.5">
                          <Send className="h-3.5 w-3.5" /> Mark as Sent
                        </Button>
                        <Button size="sm" variant="destructive" onClick={deleteDraft} className="gap-1.5">
                          <Trash2 className="h-3.5 w-3.5" /> Delete Draft
                        </Button>
                      </>
                    )}
                    {selected.status === "sent" && (
                      <>
                        <Button size="sm" onClick={() => updateStatus("paid")} className="gap-1.5">
                          <DollarSign className="h-3.5 w-3.5" /> Mark as Paid
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateStatus("overdue")} className="gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" /> Mark as Overdue
                        </Button>
                      </>
                    )}
                    {selected.status === "overdue" && (
                      <Button size="sm" onClick={() => updateStatus("paid")} className="gap-1.5">
                        <DollarSign className="h-3.5 w-3.5" /> Mark as Paid
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadInvoice(selected)}
                      className="gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" /> Download PDF
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border p-3">
                  <Label className="text-sm font-semibold">Record Payment (with allocation)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={paymentReceivedAt} onChange={(e) => setPaymentReceivedAt(e.target.value)} type="date" />
                    <Input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Reference" />
                  </div>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank transfer</SelectItem>
                      <SelectItem value="check">Check</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={allocationSearch}
                    onChange={(e) => setAllocationSearch(e.target.value)}
                    placeholder="Search invoice number for allocation"
                  />
                  <div className="space-y-2 max-h-44 overflow-auto">
                    {selectedClientOpenInvoices.map((invoice) => (
                      <div key={invoice.id} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground min-w-28">{invoice.invoice_number}</span>
                        <Input
                          value={paymentAllocations[invoice.id] ?? ""}
                          onChange={(e) => setPaymentAllocations((prev) => ({ ...prev, [invoice.id]: e.target.value }))}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total allocated</span>
                    <span className="font-semibold">${totalAllocated.toFixed(2)}</span>
                  </div>
                  <Button size="sm" onClick={savePayment} disabled={savingPayment || totalAllocated <= 0} className="w-full">
                    {savingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save Payment
                  </Button>
                </div>

                <div className="space-y-3 rounded-lg border p-3">
                  <Label className="text-sm font-semibold">Issue Credit Memo</Label>
                  <Input value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="Reason" />
                  <Input value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="Credit amount" />
                  <Button size="sm" variant="outline" className="w-full" onClick={issueCreditMemo} disabled={savingCredit || !creditReason || Number(creditAmount) <= 0}>
                    {savingCredit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Issue Credit Memo
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Create Invoice Sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Invoice</SheetTitle>
            <SheetDescription>Select a client and their rugs to generate a draft invoice.</SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-6">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedClientId && (
              <div className="space-y-2">
                <Label>Rugs ({clientRugs.length} available)</Label>
                {clientRugs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rugs found for this client.</p>
                ) : (
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {clientRugs.map((rug) => {
                      const sqft = (rug.size_length ?? 0) * (rug.size_width ?? 0);
                      return (
                        <label
                          key={rug.id}
                          className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50"
                        >
                          <Checkbox
                            checked={selectedRugIds.has(rug.id)}
                            onCheckedChange={() => toggleRug(rug.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-bold">{rug.tag}</span>
                              <span className="text-xs text-muted-foreground">
                                {rug.size_length ?? "?"}×{rug.size_width ?? "?"} ft ({sqft} sqft)
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(rug.rug_services ?? []).map((rs, i) => (
                                <Badge key={i} variant="outline" className="text-xs h-5 px-1.5">{rs.services?.name ?? "Service"}</Badge>
                              ))}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {selectedRugIds.size > 0 && (
              <div className="space-y-2">
                <Label>Line Items Preview</Label>
                <div className="border border-border rounded-lg divide-y divide-border text-sm">
                  {computeLineItems().map((li, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2">
                      <span className="text-foreground">{li.description}</span>
                      <span className="font-medium text-foreground">${li.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between px-3 py-2 font-semibold text-foreground">
                  <span>Total</span>
                  <span>${draftTotal.toFixed(2)}</span>
                </div>
              </div>
            )}

            <Button
              onClick={createDraft}
              disabled={!selectedClientId || selectedRugIds.size === 0 || creating}
              className="w-full gap-1.5"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Draft Invoice
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
