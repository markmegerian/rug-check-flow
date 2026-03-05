import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, Download, Send, Trash2, DollarSign, AlertTriangle, Loader2, Plus, CalendarIcon, X, Search, CreditCard, Receipt } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import { useAuth } from "@/contexts/AuthContext";

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

type PaymentRow = Tables<"payments"> & {
  payment_allocations: (Tables<"payment_allocations"> & {
    invoices: { invoice_number: string; id: string } | null;
  })[];
};

type CreditMemoRow = Tables<"credit_memos"> & {
  credit_memo_lines: Tables<"credit_memo_lines">[];
  invoices: { invoice_number: string } | null;
};

export function InvoicesTab() {
  const { user } = useAuth();
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

  // Create flow state
  const [createOpen, setCreateOpen] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientRugs, setClientRugs] = useState<RugOption[]>([]);
  const [selectedRugIds, setSelectedRugIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  // Payment entry state
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentReceivedAt, setPaymentReceivedAt] = useState<Date>(new Date());
  const [allocatingPayment, setAllocatingPayment] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [availableInvoices, setAvailableInvoices] = useState<InvoiceRow[]>([]);
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});

  // Credit memo state
  const [creditMemoOpen, setCreditMemoOpen] = useState(false);
  const [creditMemoReason, setCreditMemoReason] = useState("");
  const [creditMemoLines, setCreditMemoLines] = useState<Array<{ description: string; quantity: string; unit_price: string }>>([{ description: "", quantity: "1", unit_price: "" }]);
  const [creatingCreditMemo, setCreatingCreditMemo] = useState(false);

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
    setSheetOpen(true);
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

  // Fetch payments and credit memos for selected invoice
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [creditMemos, setCreditMemos] = useState<CreditMemoRow[]>([]);
  const [invoiceBalance, setInvoiceBalance] = useState<number | null>(null);

  const fetchInvoiceFinancials = useCallback(async (invoiceId: string) => {
    // Fetch payment allocations for this invoice (simple query first)
    const { data: allocationsData } = await supabase
      .from("payment_allocations")
      .select("id, payment_id, amount, invoice_id")
      .eq("invoice_id", invoiceId);
    
    if (!allocationsData || allocationsData.length === 0) {
      setPayments([]);
    } else {
      // Get unique payment IDs
      const paymentIds = [...new Set(allocationsData.map(a => a.payment_id as string))];
      
      // Fetch payments
      const { data: paymentsData } = await supabase
        .from("payments")
        .select("*")
        .in("id", paymentIds);
      
      // Combine payments with their allocations
      const paymentsMap = new Map<string, PaymentRow>();
      if (paymentsData) {
        for (const payment of paymentsData) {
          paymentsMap.set(payment.id, {
            ...payment,
            payment_allocations: [],
          });
        }
      }
      
      // Add allocations to payments
      for (const alloc of allocationsData) {
        const paymentId = alloc.payment_id as string;
        const payment = paymentsMap.get(paymentId);
        if (payment) {
          payment.payment_allocations.push({
            ...alloc,
            invoices: { invoice_number: "", id: invoiceId },
          } as PaymentRow["payment_allocations"][0]);
        }
      }
      
      setPayments(Array.from(paymentsMap.values()));
    }

    // Fetch credit memos (simplified query)
    const { data: creditMemosData } = await supabase
      .from("credit_memos")
      .select("id, invoice_id, memo_number, reason, total, created_at")
      .eq("invoice_id", invoiceId);
    
    if (creditMemosData && creditMemosData.length > 0) {
      // Fetch credit memo lines separately
      const memoIds = creditMemosData.map(m => m.id);
      const { data: linesData } = await supabase
        .from("credit_memo_lines")
        .select("*")
        .in("credit_memo_id", memoIds);
      
      // Combine memos with lines
      const memosWithLines: CreditMemoRow[] = creditMemosData.map(memo => ({
        ...memo,
        credit_memo_lines: linesData?.filter(l => l.credit_memo_id === memo.id) ?? [],
        invoices: { invoice_number: "" },
      })) as CreditMemoRow[];
      
      setCreditMemos(memosWithLines);
    } else {
      setCreditMemos([]);
    }

    // Fetch invoice balance
    const { data: invoiceData } = await supabase
      .from("invoices")
      .select("balance")
      .eq("id", invoiceId)
      .single();
    setInvoiceBalance(invoiceData?.balance ?? null);
  }, []);

  useEffect(() => {
    if (selected?.id) {
      fetchInvoiceFinancials(selected.id);
    }
  }, [selected?.id, fetchInvoiceFinancials]);

  // Payment entry functions
  const openPaymentEntry = async () => {
    if (!selected?.client_id) return;
    setPaymentOpen(true);
    setPaymentAmount("");
    setPaymentMethod("cash");
    setPaymentReference("");
    setPaymentReceivedAt(new Date());
    setInvoiceSearch("");
    setAllocationAmounts({});

    // Fetch invoices for this client that have a balance
    const { data } = await supabase
      .from("invoices")
      .select("*, clients(name), invoice_items(*)")
      .eq("client_id", selected.client_id)
      .in("status", ["sent", "overdue", "paid", "disputed"])
      .order("created_at", { ascending: false });
    
    // Fetch balances for all invoices
    if (data) {
      const invoicesWithBalance = await Promise.all(
        (data as InvoiceRow[]).map(async (inv) => {
          const { data: invData } = await supabase
            .from("invoices")
            .select("balance")
            .eq("id", inv.id)
            .single();
          return { ...inv, balance: invData?.balance ?? inv.total };
        })
      );
      setAvailableInvoices(invoicesWithBalance);
    } else {
      setAvailableInvoices([]);
    }
  };

  const handleCreatePayment = async () => {
    if (!selected?.client_id || !user?.id) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }

    setAllocatingPayment(true);

    // Create payment
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        client_id: selected.client_id,
        amount,
        method: paymentMethod,
        reference: paymentReference,
        received_at: paymentReceivedAt.toISOString(),
        entered_by: user.id,
      })
      .select()
      .single();

    if (paymentError || !payment) {
      toast({ title: "Error creating payment", description: paymentError?.message, variant: "destructive" });
      setAllocatingPayment(false);
      return;
    }

    // Create allocations
    const allocations = Object.entries(allocationAmounts)
      .filter(([_, amt]) => amt && parseFloat(amt) > 0)
      .map(([invoiceId, amt]) => ({
        payment_id: payment.id,
        invoice_id: invoiceId,
        amount: parseFloat(amt),
      }));

    if (allocations.length > 0) {
      const { error: allocError } = await supabase
        .from("payment_allocations")
        .insert(allocations);

      if (allocError) {
        toast({ title: "Error allocating payment", description: allocError.message, variant: "destructive" });
        setAllocatingPayment(false);
        return;
      }
    }

    toast({ title: "Payment recorded" });
    setPaymentOpen(false);
    setAllocatingPayment(false);
    if (selected?.id) {
      await fetchInvoiceFinancials(selected.id);
      await refreshInvoices();
    }
  };

  // Credit memo functions
  const openCreditMemo = () => {
    setCreditMemoOpen(true);
    setCreditMemoReason("");
    setCreditMemoLines([{ description: "", quantity: "1", unit_price: "" }]);
  };

  const handleCreateCreditMemo = async () => {
    if (!selected?.client_id || !user?.id) return;
    if (!creditMemoReason.trim()) {
      toast({ title: "Reason required", variant: "destructive" });
      return;
    }

    const lines = creditMemoLines
      .filter((l) => l.description.trim() && l.unit_price)
      .map((l) => ({
        description: l.description,
        quantity: parseFloat(l.quantity) || 1,
        unit_price: -Math.abs(parseFloat(l.unit_price)), // Ensure negative
        total: -(Math.abs(parseFloat(l.unit_price)) * (parseFloat(l.quantity) || 1)),
      }));

    if (lines.length === 0) {
      toast({ title: "At least one line item required", variant: "destructive" });
      return;
    }

    const total = lines.reduce((sum, l) => sum + l.total, 0);
    const memoNumber = `CM-${Date.now().toString(36).toUpperCase()}`;

    setCreatingCreditMemo(true);

    // Create credit memo
    const { data: creditMemo, error: memoError } = await supabase
      .from("credit_memos")
      .insert({
        invoice_id: selected.id,
        client_id: selected.client_id,
        memo_number: memoNumber,
        reason: creditMemoReason,
        total,
        created_by: user.id,
      })
      .select()
      .single();

    if (memoError || !creditMemo) {
      toast({ title: "Error creating credit memo", description: memoError?.message, variant: "destructive" });
      setCreatingCreditMemo(false);
      return;
    }

    // Create credit memo lines
    const { error: linesError } = await supabase
      .from("credit_memo_lines")
      .insert(lines.map((l) => ({ ...l, credit_memo_id: creditMemo.id })));

    if (linesError) {
      toast({ title: "Error creating credit memo lines", description: linesError.message, variant: "destructive" });
      setCreatingCreditMemo(false);
      return;
    }

    toast({ title: "Credit memo created" });
    setCreditMemoOpen(false);
    setCreatingCreditMemo(false);
    if (selected?.id) {
      await fetchInvoiceFinancials(selected.id);
      await refreshInvoices();
    }
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
                  <div className="space-y-1 mt-2 px-3 text-sm">
                    <div className="flex justify-between text-foreground">
                      <span>Subtotal</span>
                      <span>${Number(selected.total).toFixed(2)}</span>
                    </div>
                    {payments.length > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Payments</span>
                        <span className="text-green-600 dark:text-green-400">
                          -${payments.reduce((sum, p) => sum + (p.payment_allocations.find((a) => a.invoice_id === selected.id)?.amount ?? 0), 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                    {creditMemos.length > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Credits</span>
                        <span className="text-blue-600 dark:text-blue-400">
                          +${Math.abs(creditMemos.reduce((sum, cm) => sum + cm.total, 0)).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-border font-semibold text-foreground">
                      <span>Balance</span>
                      <span className={cn(
                        invoiceBalance !== null && invoiceBalance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                      )}>
                        ${(invoiceBalance !== null ? invoiceBalance : Number(selected.total)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Payments section */}
                {payments.length > 0 && (
                  <div>
                    <Label className="mb-2 block">Payments</Label>
                    <div className="border border-border rounded-lg divide-y divide-border text-sm">
                      {payments.map((payment) => {
                        const allocation = payment.payment_allocations.find((a) => a.invoice_id === selected.id);
                        if (!allocation) return null;
                        return (
                          <div key={payment.id} className="flex items-center justify-between px-3 py-2.5">
                            <div>
                              <span className="font-medium text-foreground">{format(new Date(payment.received_at), "MMM d, yyyy")}</span>
                              <span className="text-muted-foreground ml-2">{payment.method}</span>
                              {payment.reference && (
                                <span className="text-muted-foreground ml-2">• {payment.reference}</span>
                              )}
                            </div>
                            <span className="font-medium text-green-600 dark:text-green-400">${Number(allocation.amount).toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Credit memos section */}
                {creditMemos.length > 0 && (
                  <div>
                    <Label className="mb-2 block">Credit Memos</Label>
                    <div className="border border-border rounded-lg divide-y divide-border text-sm">
                      {creditMemos.map((cm) => (
                        <div key={cm.id} className="px-3 py-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs text-muted-foreground">{cm.memo_number}</span>
                            <span className="font-medium text-blue-600 dark:text-blue-400">${Math.abs(Number(cm.total)).toFixed(2)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{cm.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                    {selected.status !== "draft" && (
                      <>
                        <Button size="sm" variant="outline" onClick={openPaymentEntry} className="gap-1.5">
                          <CreditCard className="h-3.5 w-3.5" /> Record Payment
                        </Button>
                        <Button size="sm" variant="outline" onClick={openCreditMemo} className="gap-1.5">
                          <Receipt className="h-3.5 w-3.5" /> Issue Credit
                        </Button>
                      </>
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

      {/* Payment Entry Sheet */}
      <Sheet open={paymentOpen} onOpenChange={setPaymentOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Record Payment</SheetTitle>
            <SheetDescription>Enter payment details and allocate to invoices.</SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-6">
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="ach">ACH</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reference</Label>
              <Input
                placeholder="Check #, transaction ID, etc."
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Received Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !paymentReceivedAt && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {paymentReceivedAt ? format(paymentReceivedAt, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={paymentReceivedAt} onSelect={(d) => d && setPaymentReceivedAt(d)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Allocate to Invoices</Label>
              <Input
                placeholder="Search invoices..."
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                className="mb-2"
              />
              <div className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
                {availableInvoices
                  .filter((inv) => 
                    invoiceSearch.trim() === "" || 
                    inv.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase())
                  )
                  .map((inv) => {
                    // Use balance from invoice if available, otherwise use total
                    const balance = (inv as InvoiceRow & { balance?: number }).balance ?? Number(inv.total);
                    return (
                      <div key={inv.id} className="px-3 py-2.5">
                        <div className="flex items-center justify-between mb-1">
                          <div>
                            <span className="font-mono text-sm font-medium">{inv.invoice_number}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              Balance: ${balance.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max={balance}
                          placeholder="0.00"
                          value={allocationAmounts[inv.id] || ""}
                          onChange={(e) => setAllocationAmounts((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                          className="h-8 text-sm"
                        />
                      </div>
                    );
                  })}
              </div>
            </div>

            <Button
              onClick={handleCreatePayment}
              disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || allocatingPayment}
              className="w-full gap-1.5"
            >
              {allocatingPayment && <Loader2 className="h-4 w-4 animate-spin" />}
              Record Payment
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Credit Memo Sheet */}
      <Sheet open={creditMemoOpen} onOpenChange={setCreditMemoOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Issue Credit Memo</SheetTitle>
            <SheetDescription>Create a credit memo for adjustments or refunds.</SheetDescription>
          </SheetHeader>

          <div className="space-y-5 py-6">
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Textarea
                placeholder="Explain the reason for this credit..."
                value={creditMemoReason}
                onChange={(e) => setCreditMemoReason(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Line Items</Label>
              <div className="space-y-3">
                {creditMemoLines.map((line, idx) => (
                  <div key={idx} className="border border-border rounded-lg p-3 space-y-2">
                    <Input
                      placeholder="Description"
                      value={line.description}
                      onChange={(e) => {
                        const newLines = [...creditMemoLines];
                        newLines[idx].description = e.target.value;
                        setCreditMemoLines(newLines);
                      }}
                    />
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Quantity"
                        value={line.quantity}
                        onChange={(e) => {
                          const newLines = [...creditMemoLines];
                          newLines[idx].quantity = e.target.value;
                          setCreditMemoLines(newLines);
                        }}
                        className="w-24"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Unit Price"
                        value={line.unit_price}
                        onChange={(e) => {
                          const newLines = [...creditMemoLines];
                          newLines[idx].unit_price = e.target.value;
                          setCreditMemoLines(newLines);
                        }}
                        className="flex-1"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreditMemoLines([...creditMemoLines, { description: "", quantity: "1", unit_price: "" }])}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Line Item
              </Button>
            </div>

            {creditMemoLines.some((l) => l.description && l.unit_price) && (
              <div className="border border-border rounded-lg p-3">
                <div className="flex justify-between font-semibold">
                  <span>Total Credit</span>
                  <span className="text-blue-600 dark:text-blue-400">
                    ${Math.abs(creditMemoLines
                      .filter((l) => l.description && l.unit_price)
                      .reduce((sum, l) => sum + (parseFloat(l.unit_price) || 0) * (parseFloat(l.quantity) || 1), 0)
                    ).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <Button
              onClick={handleCreateCreditMemo}
              disabled={!creditMemoReason.trim() || creatingCreditMemo}
              className="w-full gap-1.5"
            >
              {creatingCreditMemo && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Credit Memo
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
