import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { MOCK_INVOICES, type Invoice, type InvoiceStatus } from "@/data/mock-invoices";

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export function InvoicesTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([...MOCK_INVOICES]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [editStatus, setEditStatus] = useState<InvoiceStatus>("draft");
  const [editNotes, setEditNotes] = useState("");

  const openInvoice = (inv: Invoice) => {
    setSelected(inv);
    setEditStatus(inv.status);
    setEditNotes(inv.notes);
    setSheetOpen(true);
  };

  const saveInvoice = () => {
    if (!selected) return;
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === selected.id ? { ...inv, status: editStatus, notes: editNotes } : inv
      )
    );
    setSheetOpen(false);
  };

  const sorted = [...invoices].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-4 md:p-6 overflow-auto h-full">
      <h2 className="text-lg font-semibold text-foreground mb-4">Invoices</h2>

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
          {sorted.map((inv) => (
            <TableRow key={inv.id}>
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
                <Button variant="ghost" size="icon" onClick={() => openInvoice(inv)}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
                    <span className="text-muted-foreground">Rugs</span>
                    <p className="font-medium text-foreground">{selected.rugCount}</p>
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <Label className="mb-2 block">Line Items</Label>
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

                {/* Status */}
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editStatus} onValueChange={(v) => setEditStatus(v as InvoiceStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["draft", "sent", "paid", "overdue"] as InvoiceStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                <Button onClick={saveInvoice} className="w-full">Save Changes</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
