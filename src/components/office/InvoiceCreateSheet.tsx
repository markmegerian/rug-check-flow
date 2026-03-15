import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

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

interface InvoiceCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function InvoiceCreateSheet({ open, onOpenChange, onCreated }: InvoiceCreateSheetProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientRugs, setClientRugs] = useState<RugOption[]>([]);
  const [selectedRugIds, setSelectedRugIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.from("clients").select("id, name, pricing_tier").order("name");
      setClients(data ?? []);
      setSelectedClientId("");
      setClientRugs([]);
      setSelectedRugIds(new Set());
    })();
  }, [open]);

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
      .flatMap((rug) =>
        (rug.rug_services ?? []).map((rs) => ({
          rug_id: rug.id,
          description: `${rs.services?.name ?? "Service"} — ${rug.tag}`,
          quantity: 1,
          unit_price: Number(rs.line_total),
          total: Number(rs.line_total),
        }))
      );
  }, [clientRugs, selectedRugIds]);

  const draftTotal = useMemo(() => computeLineItems().reduce((sum, li) => sum + li.total, 0), [computeLineItems]);

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
    onOpenChange(false);
    setCreating(false);
    onCreated();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
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
  );
}
