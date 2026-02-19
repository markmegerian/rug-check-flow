import { useState, useMemo } from "react";
import { Eye, FileText, Download, Send, Trash2, DollarSign, AlertTriangle } from "lucide-react";
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
import { MOCK_INVOICES, type Invoice, type InvoiceStatus } from "@/data/mock-invoices";
import { SEED_CHECK_IN_LOG, type CheckInEntry } from "@/data/check-in-log";
import { toast } from "@/hooks/use-toast";

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

function groupByClient(entries: CheckInEntry[]): Record<string, CheckInEntry[]> {
  return entries.reduce<Record<string, CheckInEntry[]>>((acc, entry) => {
    (acc[entry.clientName] ||= []).push(entry);
    return acc;
  }, {});
}

function nextInvoiceNumber(invoices: Invoice[]): string {
  const maxNum = invoices.reduce((max, inv) => {
    const match = inv.invoiceNumber.match(/INV-\d{4}-(\d+)/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  return `INV-2026-${String(maxNum + 1).padStart(3, "0")}`;
}

export function InvoicesTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([...MOCK_INVOICES]);
  const [uninvoicedEntries, setUninvoicedEntries] = useState<CheckInEntry[]>([...SEED_CHECK_IN_LOG]);
  const [activeTab, setActiveTab] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [editNotes, setEditNotes] = useState("");

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: invoices.length };
    for (const inv of invoices) {
      counts[inv.status] = (counts[inv.status] || 0) + 1;
    }
    return counts;
  }, [invoices]);

  const filtered = useMemo(() => {
    const list = activeTab === "all" ? invoices : invoices.filter((inv) => inv.status === activeTab);
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [invoices, activeTab]);

  const uninvoicedGroups = useMemo(() => groupByClient(uninvoicedEntries), [uninvoicedEntries]);

  const openInvoice = (inv: Invoice) => {
    setSelected(inv);
    setEditNotes(inv.notes);
    setSheetOpen(true);
  };

  const updateStatus = (newStatus: InvoiceStatus) => {
    if (!selected) return;
    const updated = { ...selected, status: newStatus };
    setInvoices((prev) => prev.map((inv) => (inv.id === selected.id ? updated : inv)));
    setSelected(updated);
  };

  const saveNotes = () => {
    if (!selected) return;
    const updated = { ...selected, notes: editNotes };
    setInvoices((prev) => prev.map((inv) => (inv.id === selected.id ? updated : inv)));
    setSelected(updated);
    toast({ title: "Notes saved" });
  };

  const deleteDraft = () => {
    if (!selected) return;
    setInvoices((prev) => prev.filter((inv) => inv.id !== selected.id));
    setSheetOpen(false);
    setSelected(null);
    toast({ title: "Draft deleted" });
  };

  const generateDraft = (clientName: string) => {
    const entries = uninvoicedGroups[clientName];
    if (!entries?.length) return;

    const lineItems = entries.map((e) => ({
      rugNumber: e.rugNumber,
      services: e.services.map((s) => s.name),
      subtotal: e.totalPrice,
    }));

    const newInv: Invoice = {
      id: `inv-gen-${Date.now()}`,
      invoiceNumber: nextInvoiceNumber(invoices),
      clientId: "",
      clientName,
      date: new Date().toISOString().slice(0, 10),
      rugCount: entries.length,
      totalAmount: entries.reduce((sum, e) => sum + e.totalPrice, 0),
      status: "draft",
      lineItems,
      notes: "",
    };

    setInvoices((prev) => [...prev, newInv]);
    setUninvoicedEntries((prev) => prev.filter((e) => e.clientName !== clientName));
    openInvoice(newInv);
    toast({ title: `Draft ${newInv.invoiceNumber} created` });
  };

  return (
    <div className="p-4 md:p-6 overflow-auto h-full space-y-6 animate-fade-in-up">
      {/* Status Tabs */}
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

      {/* Invoice Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice #</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="hidden sm:table-cell">Date</TableHead>
            <TableHead className="w-16 text-center">Rugs</TableHead>
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
                <TableCell className="font-mono text-sm">{inv.invoiceNumber}</TableCell>
                <TableCell>{inv.clientName}</TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {inv.date}
                </TableCell>
                <TableCell className="text-center">{inv.rugCount}</TableCell>
                <TableCell className="text-right font-medium">
                  ${inv.totalAmount.toFixed(2)}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_COLORS[inv.status]} variant="secondary">
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

      {/* Uninvoiced Services */}
      {Object.keys(uninvoicedGroups).length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Uninvoiced Services
          </h3>
          <div className="space-y-2">
            {Object.entries(uninvoicedGroups).map(([clientName, entries]) => {
              const total = entries.reduce((sum, e) => sum + e.totalPrice, 0);
              return (
                <div key={clientName} className="border border-border rounded-lg p-3 space-y-2 shadow-card">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-foreground">{clientName}</span>
                      <span className="text-muted-foreground text-sm ml-2">
                        ({entries.length} rug{entries.length !== 1 ? "s" : ""}, ${total.toFixed(2)})
                      </span>
                    </div>
                    <Button size="sm" onClick={() => generateDraft(clientName)}>
                      Generate Draft
                    </Button>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-0.5 pl-1">
                    {entries.map((e) => (
                      <div key={e.id}>
                        <span className="font-mono text-foreground">{e.rugNumber}</span>
                        {": "}
                        {e.services.map((s) => s.name).join(", ")}
                        {" — "}
                        <span className="text-foreground">${e.totalPrice.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoice Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.invoiceNumber}</SheetTitle>
                <SheetDescription>{selected.clientName}</SheetDescription>
              </SheetHeader>

              <div className="space-y-6 py-6">
                {/* Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Date</span>
                    <p className="font-medium text-foreground">{selected.date}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <p>
                      <Badge className={STATUS_COLORS[selected.status]} variant="secondary">
                        {selected.status.charAt(0).toUpperCase() + selected.status.slice(1)}
                      </Badge>
                    </p>
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <Label className="mb-2 block">Line Items ({selected.rugCount} rugs)</Label>
                  <div className="border border-border rounded-lg divide-y divide-border text-sm">
                    {selected.lineItems.map((li, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2.5">
                        <div>
                          <span className="font-mono text-foreground">{li.rugNumber}</span>
                          <span className="text-muted-foreground ml-2">
                            {li.services.join(", ")}
                          </span>
                        </div>
                        <span className="font-medium text-foreground">${li.subtotal.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between px-3 py-2 mt-1 font-semibold text-foreground">
                    <span>Total</span>
                    <span>${selected.totalAmount.toFixed(2)}</span>
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

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={3}
                  />
                  <Button size="sm" variant="secondary" onClick={saveNotes}>
                    Save Notes
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
