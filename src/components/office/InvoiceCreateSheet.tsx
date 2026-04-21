import { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { calculateInvoiceDueDate, formatInvoiceTermsLabel, type BillingReminderPreference } from "@/lib/billing";
import { applyCleaningServiceMinimum } from "@/lib/service-pricing";
import type { Tables } from "@/integrations/supabase/types";

interface RugOption {
  id: string;
  tag: string;
  size_length: number | null;
  size_width: number | null;
  rug_services: { service_id: string; service_name: string; service_category: string | null; unit_price: number; line_total: number }[];
}

type ClientRugRow = Pick<Tables<"rugs">, "id" | "tag" | "size_length" | "size_width"> & {
  rug_services: { service_id: string; service_name: string; service_category: string | null; unit_price: number; line_total: number }[];
};

interface InvoiceCreateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function InvoiceCreateSheet({ open, onOpenChange, onCreated }: InvoiceCreateSheetProps) {
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = useState("");
  const [clientRugs, setClientRugs] = useState<RugOption[]>([]);
  const [selectedRugIds, setSelectedRugIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const trimmed = clientSearch.trim();
    const timer = window.setTimeout(() => {
      setDebouncedClientSearch(trimmed);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [clientSearch]);

  const { data: clientResults = [], isFetching: searchingClients } = useQuery({
    queryKey: ["invoice-create-sheet", "client-search", debouncedClientSearch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, pricing_tier, invoice_terms_days, billing_reminder_preference")
        .ilike("name", `%${debouncedClientSearch}%`)
        .order("name")
        .limit(10);
      if (error) throw error;
      return (data ?? []).filter((client) => client.name);
    },
    enabled: open && debouncedClientSearch.length >= 2,
    staleTime: 30_000,
  });

  const selectedClient = useMemo(
    () => clientResults.find((client) => client.id === selectedClientId) ?? null,
    [clientResults, selectedClientId],
  );
  const draftDueAt = useMemo(() => calculateInvoiceDueDate(new Date(), selectedClient?.invoice_terms_days), [selectedClient?.invoice_terms_days]);

  useEffect(() => {
    if (!open) return;
    setSelectedClientId("");
    setClientSearch("");
    setDebouncedClientSearch("");
    setClientRugs([]);
    setSelectedRugIds(new Set());
  }, [open]);

  useEffect(() => {
    if (!selectedClientId) {
      setClientRugs([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("rugs")
        .select("id, tag, size_length, size_width, rug_services(service_id, service_name, service_category, unit_price, line_total)")
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
        (rug.rug_services ?? []).map((rs) => {
          const adjustedTotal = applyCleaningServiceMinimum(Number(rs.line_total), rs.service_category);
          return {
            rug_id: rug.id,
            description: `${rs.service_name ?? "Service"} — ${rug.tag}`,
            quantity: 1,
            unit_price: adjustedTotal,
            total: adjustedTotal,
          };
        })
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
        due_at: draftDueAt,
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
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search client name..."
                  value={clientSearch}
                  onChange={(e) => {
                    setClientSearch(e.target.value);
                    if (selectedClientId) {
                      setSelectedClientId("");
                      setClientRugs([]);
                      setSelectedRugIds(new Set());
                    }
                  }}
                  className="pl-8 pr-8"
                />
                {clientSearch && !searchingClients && (
                  <button
                    type="button"
                    onClick={() => {
                      setClientSearch("");
                      setDebouncedClientSearch("");
                      setSelectedClientId("");
                      setClientRugs([]);
                      setSelectedRugIds(new Set());
                    }}
                    className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                    aria-label="Clear client search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {searchingClients && <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
              </div>

              <div className="min-h-[7rem] rounded-lg border border-border/70 bg-muted/20">
                {selectedClient ? (
                  <div className="flex items-start justify-between gap-3 p-3">
                    <div>
                      <p className="font-medium text-foreground">{selectedClient.name}</p>
                      <p className="text-xs text-muted-foreground">Client selected for draft invoicing.</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedClientId("");
                        setClientRugs([]);
                        setSelectedRugIds(new Set());
                      }}
                    >
                      Change
                    </Button>
                  </div>
                ) : clientSearch.trim().length < 2 ? (
                  <div className="flex h-full min-h-[7rem] items-center px-3 text-sm text-muted-foreground">
                    Type at least 2 letters to search clients.
                  </div>
                ) : clientResults.length === 0 ? (
                  <div className="flex h-full min-h-[7rem] items-center px-3 text-sm text-muted-foreground">
                    {searchingClients ? "Searching clients..." : "No matching clients found."}
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto">
                    {clientResults.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setSelectedClientId(client.id);
                          setClientSearch(client.name);
                        }}
                        className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left hover:bg-accent/50 last:border-b-0"
                      >
                        <span className="font-medium text-foreground">{client.name}</span>
                        {client.pricing_tier && client.pricing_tier !== "standard" && (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                            {client.pricing_tier}
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          {selectedClient && (
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">Billing profile</span>
                <Badge variant="outline">{formatInvoiceTermsLabel(selectedClient.invoice_terms_days)}</Badge>
              </div>
              <p className="text-muted-foreground">Draft due date will be set to {new Date(draftDueAt).toLocaleDateString()} and collections preference defaults to {selectedClient.billing_reminder_preference}.</p>
            </div>
          )}

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
