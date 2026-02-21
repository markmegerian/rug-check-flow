import { useState, useMemo, useEffect, useCallback } from "react";
import { Eye, Download, Send, Trash2, DollarSign, AlertTriangle, Loader2, Plus, CalendarIcon, X } from "lucide-react";
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
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Tables } from "@/integrations/supabase/types";

type InvoiceRow = Tables<"invoices"> & {
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

export function InvoicesTab() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [selected, setSelected] = useState<InvoiceRow | null>(null);

  // Create flow state
  const [createOpen, setCreateOpen] = useState(false);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientRugs, setClientRugs] = useState<RugOption[]>([]);
  const [selectedRugIds, setSelectedRugIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const fetchInvoices = useCallback(async () => {
    const { data, error } = await supabase
      .from("invoices")
      .select("*, clients(name), invoice_items(*)")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading invoices", description: error.message, variant: "destructive" });
      return;
    }
    setInvoices((data as InvoiceRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Fetch clients for create flow
  const openCreate = async () => {
    const { data } = await supabase.from("clients").select("id, name, pricing_tier").order("name");
    setClients(data ?? []);
    setSelectedClientId("");
    setClientRugs([]);
    setSelectedRugIds(new Set());
    setCreateOpen(true);
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
        .order("checked_in_at", { ascending: false });
      setClientRugs((data as any) ?? []);
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

  const computeLineItems = () => {
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
  };

  const draftTotal = useMemo(() => {
    return computeLineItems().reduce((sum, li) => sum + li.total, 0);
  }, [selectedRugIds, clientRugs]);

  const createDraft = async () => {
    if (!selectedClientId || selectedRugIds.size === 0) return;
    setCreating(true);

    const invNum = `INV-${Date.now().toString(36).toUpperCase()}`;
    const lineItems = computeLineItems();
    const total = lineItems.reduce((s, li) => s + li.total, 0);

    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .insert({ invoice_number: invNum, client_id: selectedClientId, status: "draft" as const, total })
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
    fetchInvoices();
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
    if (dateFrom) {
      const fromStr = format(dateFrom, "yyyy-MM-dd");
      list = list.filter((inv) => inv.created_at.slice(0, 10) >= fromStr);
    }
    if (dateTo) {
      const toStr = format(dateTo, "yyyy-MM-dd");
      list = list.filter((inv) => inv.created_at.slice(0, 10) <= toStr);
    }
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [invoices, activeTab, dateFrom, dateTo]);

  const openInvoice = (inv: InvoiceRow) => {
    setSelected(inv);
    setSheetOpen(true);
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
    toast({ title: `Marked as ${newStatus}` });
    await fetchInvoices();
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
    fetchInvoices();
  };

  useEffect(() => {
    if (selected) {
      const updated = invoices.find((i) => i.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [invoices]);

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
                      onClick={() => toast({ title: "PDF downloaded" })}
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
    </div>
  );
}
