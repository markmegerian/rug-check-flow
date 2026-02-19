import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MOCK_INVOICES } from "@/data/mock-invoices";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Download } from "lucide-react";

const CLIENT_ID = "client-3";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  sent: "default",
  paid: "secondary",
  overdue: "destructive",
  draft: "outline",
};

export default function PortalInvoicesTab() {
  const { toast } = useToast();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const invoices = MOCK_INVOICES.filter((inv) => inv.clientId === CLIENT_ID);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Invoice #</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Rugs</TableHead>
          <TableHead>Total</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((inv) => {
          const isExpanded = expandedRow === inv.id;
          return (
            <>
              <TableRow
                key={inv.id}
                className="cursor-pointer"
                onClick={() => setExpandedRow(isExpanded ? null : inv.id)}
              >
                <TableCell className="w-8 pr-0">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </TableCell>
                <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                <TableCell>{new Date(inv.date).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</TableCell>
                <TableCell>{inv.rugCount}</TableCell>
                <TableCell>${inv.totalAmount.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[inv.status] ?? "outline"}>
                    {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      toast({ title: "Download started", description: `${inv.invoiceNumber}.pdf` });
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
              {isExpanded && (
                <TableRow key={`${inv.id}-detail`}>
                  <TableCell colSpan={7} className="bg-muted/30">
                    <div className="py-2 pl-8 space-y-1 text-sm">
                      {inv.lineItems.map((li, i) => (
                        <div key={i} className="flex justify-between max-w-md">
                          <span>
                            <span className="font-medium">{li.rugNumber}</span>
                            <span className="text-muted-foreground ml-2">{li.services.join(", ")}</span>
                          </span>
                          <span>${li.subtotal.toFixed(2)}</span>
                        </div>
                      ))}
                      {inv.notes && (
                        <p className="text-muted-foreground mt-2 italic">{inv.notes}</p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          );
        })}
      </TableBody>
    </Table>
  );
}
