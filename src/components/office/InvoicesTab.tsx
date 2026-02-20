import { useState, useMemo, useEffect, useCallback } from "react";
import { Eye, FileText, Download, Send, Trash2, DollarSign, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
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

export function InvoicesTab() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<InvoiceRow | null>(null);

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

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: invoices.length };
    for (const inv of invoices) {
      counts[inv.status] = (counts[inv.status] || 0) + 1;
    }
    return counts;
  }, [invoices]);

  const filtered = useMemo(() => {
    const list = activeTab === "all" ? invoices : invoices.filter((inv) => inv.status === activeTab);
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [invoices, activeTab]);

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
    // Re-select updated invoice
    setSelected((prev) => {
      if (!prev) return null;
      return invoices.find((i) => i.id === prev.id) ?? prev;
    });
  };

  const deleteDraft = async () => {
    if (!selected) return;
    // Delete items first, then invoice
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

  // Refresh selected after invoices update
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

                {/* Line Items */}
                <div>
                  <Label className="mb-2 block">Line Items ({rugCount(selected)})</Label>
                  <div className="border border-border rounded-lg divide-y divide-border text-sm">
                    {selected.invoice_items.map((li) => (
                      <div key={li.id} className="flex items-center justify-between px-3 py-2.5">
                        <div>
                          <span className="font-medium text-foreground">{li.description}</span>
                          <span className="text-muted-foreground ml-2">
                            ×{Number(li.quantity)}
                          </span>
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

                {/* Status Actions */}
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
    </div>
  );
}
