import { useState, useMemo, useEffect } from "react";
import { Download, Send, Trash2, DollarSign, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";

type InvoiceRow = Tables<"invoices"> & {
  pdf_storage_path?: string | null;
  clients: { name: string } | null;
};

type InvoiceItemRow = Tables<"invoice_items">;

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

interface InvoiceDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceRow | null;
  clientOpenInvoices: InvoiceRow[];
  onUpdateStatus: (status: InvoiceStatus) => Promise<void>;
  onDeleteDraft: () => Promise<void>;
  onDownloadPdf: (invoice: InvoiceRow) => Promise<void>;
  onSavePayment: (params: {
    method: string;
    reference: string;
    receivedAt: string;
    allocations: Record<string, string>;
  }) => Promise<void>;
  onIssueCreditMemo: (reason: string, amount: string) => Promise<void>;
}

export function InvoiceDetailSheet({
  open,
  onOpenChange,
  invoice,
  clientOpenInvoices,
  onUpdateStatus,
  onDeleteDraft,
  onDownloadPdf,
  onSavePayment,
  onIssueCreditMemo,
}: InvoiceDetailSheetProps) {
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentReceivedAt, setPaymentReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [allocationSearch, setAllocationSearch] = useState("");
  const [paymentAllocations, setPaymentAllocations] = useState<Record<string, string>>({});
  const [savingPayment, setSavingPayment] = useState(false);
  const [creditReason, setCreditReason] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [savingCredit, setSavingCredit] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItemRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Reset allocations when invoice changes
  const invoiceId = invoice?.id;
  const [lastInvoiceId, setLastInvoiceId] = useState<string | undefined>();
  if (invoiceId !== lastInvoiceId) {
    setLastInvoiceId(invoiceId);
    if (invoice) {
      setPaymentAllocations({ [invoice.id]: Number(invoice.total).toFixed(2) });
    }
    setAllocationSearch("");
    setCreditReason("");
    setCreditAmount("");
  }

  useEffect(() => {
    if (!invoice?.id || !open) {
      setInvoiceItems([]);
      return;
    }

    let active = true;
    setLoadingItems(true);
    void supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setInvoiceItems([]);
          setLoadingItems(false);
          return;
        }
        setInvoiceItems(data ?? []);
        setLoadingItems(false);
      });

    return () => {
      active = false;
    };
  }, [invoice?.id, open]);

  const filteredOpenInvoices = useMemo(() => {
    const query = allocationSearch.trim().toLowerCase();
    return clientOpenInvoices.filter(
      (inv) => !query || inv.invoice_number.toLowerCase().includes(query)
    );
  }, [allocationSearch, clientOpenInvoices]);

  const totalAllocated = useMemo(
    () => Object.values(paymentAllocations).reduce((sum, v) => sum + (Number(v) || 0), 0),
    [paymentAllocations]
  );

  const handleSavePayment = async () => {
    setSavingPayment(true);
    await onSavePayment({
      method: paymentMethod,
      reference: paymentReference,
      receivedAt: paymentReceivedAt,
      allocations: paymentAllocations,
    });
    setPaymentReference("");
    setSavingPayment(false);
  };

  const handleIssueCreditMemo = async () => {
    setSavingCredit(true);
    await onIssueCreditMemo(creditReason, creditAmount);
    setCreditReason("");
    setCreditAmount("");
    setSavingCredit(false);
  };

  const clientName = invoice?.clients?.name ?? "Unknown";
  const rugCount = invoiceItems.length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-full sm:max-w-lg overflow-y-auto">
        {invoice && (
          <>
            <SheetHeader>
              <SheetTitle>{invoice.invoice_number}</SheetTitle>
              <SheetDescription>{clientName}</SheetDescription>
            </SheetHeader>

            <div className="space-y-6 py-6">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Date</span>
                  <p className="font-medium text-foreground">{invoice.created_at.slice(0, 10)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Due</span>
                  <p className="font-medium text-foreground">{invoice.due_at ? invoice.due_at.slice(0, 10) : "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p>
                    <Badge className={STATUS_COLORS[invoice.status as InvoiceStatus]} variant="secondary">
                      {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                    </Badge>
                  </p>
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Line Items ({rugCount})</Label>
                <div className="border border-border rounded-lg divide-y divide-border text-sm">
                  {loadingItems ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">Loading line items…</div>
                  ) : invoiceItems.map((li) => (
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
                  <span>${Number(invoice.total).toFixed(2)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Actions</Label>
                <div className="flex flex-wrap gap-2">
                  {invoice.status === "draft" && (
                    <>
                      <Button size="sm" onClick={() => onUpdateStatus("sent")} className="gap-1.5">
                        <Send className="h-3.5 w-3.5" /> Mark as Sent
                      </Button>
                      <Button size="sm" variant="destructive" onClick={onDeleteDraft} className="gap-1.5">
                        <Trash2 className="h-3.5 w-3.5" /> Delete Draft
                      </Button>
                    </>
                  )}
                  {invoice.status === "sent" && (
                    <>
                      <Button size="sm" onClick={() => onUpdateStatus("paid")} className="gap-1.5">
                        <DollarSign className="h-3.5 w-3.5" /> Mark as Paid
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onUpdateStatus("overdue")} className="gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" /> Mark as Overdue
                      </Button>
                    </>
                  )}
                  {invoice.status === "overdue" && (
                    <Button size="sm" onClick={() => onUpdateStatus("paid")} className="gap-1.5">
                      <DollarSign className="h-3.5 w-3.5" /> Mark as Paid
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => onDownloadPdf(invoice)} className="gap-1.5">
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
                  {filteredOpenInvoices.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground min-w-28">{inv.invoice_number}</span>
                      <Input
                        value={paymentAllocations[inv.id] ?? ""}
                        onChange={(e) => setPaymentAllocations((prev) => ({ ...prev, [inv.id]: e.target.value }))}
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
                <Button size="sm" onClick={handleSavePayment} disabled={savingPayment || totalAllocated <= 0} className="w-full">
                  {savingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save Payment
                </Button>
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <Label className="text-sm font-semibold">Issue Credit Memo</Label>
                <Input value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="Reason" />
                <Input value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="Credit amount" />
                <Button size="sm" variant="outline" className="w-full" onClick={handleIssueCreditMemo} disabled={savingCredit || !creditReason || Number(creditAmount) <= 0}>
                  {savingCredit ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Issue Credit Memo
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
