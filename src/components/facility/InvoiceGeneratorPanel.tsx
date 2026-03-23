import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, FileText, Loader2, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/states/PageState";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { RugDetailSheet } from "./RugDetailSheet";

type ClientOption = {
  id: string;
  name: string;
  address: string;
};

type UninvoicedRug = {
  id: string;
  tag: string;
  description: string;
  status: string;
  size_length: number | null;
  size_width: number | null;
  services: string[];
  serviceTotal: number;
};

export function InvoiceGeneratorPanel() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [rugs, setRugs] = useState<UninvoicedRug[]>([]);
  const [selectedRugIds, setSelectedRugIds] = useState<Set<string>>(new Set());
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingRugs, setLoadingRugs] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [detailRugId, setDetailRugId] = useState<string | null>(null);

  // Fetch clients on mount
  useEffect(() => {
    const fetchClients = async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, address")
        .order("name");

      if (error) {
        toast({ title: "Failed to load clients", description: error.message, variant: "destructive" });
      }
      setClients((data ?? []) as ClientOption[]);
      setLoadingClients(false);
    };
    fetchClients();
  }, []);

  // Fetch uninvoiced rugs for selected client
  const fetchUninvoicedRugs = useCallback(async (clientId: string) => {
    setLoadingRugs(true);
    setSelectedRugIds(new Set());

    // 1. Get all rugs for this client that are ready or picked_up
    const { data: rugsData, error: rugsError } = await supabase
      .from("rugs")
      .select("id, tag, description, status, size_length, size_width, services")
      .eq("client_id", clientId)
      .in("status", ["ready", "checked_in", "in_production", "picked_up"])
      .order("tag");

    if (rugsError) {
      toast({ title: "Failed to load rugs", description: rugsError.message, variant: "destructive" });
      setLoadingRugs(false);
      return;
    }

    const allRugs = rugsData ?? [];
    if (allRugs.length === 0) {
      setRugs([]);
      setLoadingRugs(false);
      return;
    }

    // 2. Find which rugs already have invoice items
    const rugIds = allRugs.map((r) => r.id);
    const { data: invoicedItems } = await supabase
      .from("invoice_items")
      .select("rug_id")
      .in("rug_id", rugIds);

    const invoicedRugIds = new Set((invoicedItems ?? []).map((i) => i.rug_id));

    // 3. For uninvoiced rugs, fetch their service line totals
    const uninvoicedRugs = allRugs.filter((r) => !invoicedRugIds.has(r.id));

    if (uninvoicedRugs.length === 0) {
      setRugs([]);
      setLoadingRugs(false);
      return;
    }

    const uninvoicedIds = uninvoicedRugs.map((r) => r.id);
    const { data: rugServices } = await supabase
      .from("rug_services")
      .select("rug_id, line_total")
      .in("rug_id", uninvoicedIds);

    const serviceTotalByRug: Record<string, number> = {};
    (rugServices ?? []).forEach((s) => {
      serviceTotalByRug[s.rug_id] = (serviceTotalByRug[s.rug_id] ?? 0) + Number(s.line_total);
    });

    setRugs(
      uninvoicedRugs.map((r) => ({
        id: r.id,
        tag: r.tag,
        description: r.description ?? "",
        status: r.status ?? "",
        size_length: r.size_length,
        size_width: r.size_width,
        services: r.services ?? [],
        serviceTotal: serviceTotalByRug[r.id] ?? 0,
      })),
    );
    setLoadingRugs(false);
  }, []);

  useEffect(() => {
    if (selectedClientId) {
      fetchUninvoicedRugs(selectedClientId);
    } else {
      setRugs([]);
      setSelectedRugIds(new Set());
    }
  }, [selectedClientId, fetchUninvoicedRugs]);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, clientSearch]);

  const toggleRug = (rugId: string) => {
    setSelectedRugIds((prev) => {
      const next = new Set(prev);
      if (next.has(rugId)) next.delete(rugId);
      else next.add(rugId);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedRugIds(new Set(rugs.map((r) => r.id)));
  };

  const deselectAll = () => {
    setSelectedRugIds(new Set());
  };

  const selectedTotal = useMemo(
    () => rugs.filter((r) => selectedRugIds.has(r.id)).reduce((sum, r) => sum + r.serviceTotal, 0),
    [rugs, selectedRugIds],
  );

  const handleGenerateInvoice = async () => {
    if (!selectedClientId || selectedRugIds.size === 0) return;

    setGenerating(true);
    try {
      const rugIdsToInvoice = Array.from(selectedRugIds);

      // Fetch rug_services for selected rugs
      const { data: rugServices, error: svcError } = await supabase
        .from("rug_services")
        .select("rug_id, service_name, unit_price, line_total")
        .in("rug_id", rugIdsToInvoice);

      if (svcError || !rugServices || rugServices.length === 0) {
        toast({ title: "No services found", description: "Selected rugs have no services to invoice.", variant: "destructive" });
        setGenerating(false);
        return;
      }

      // Get rug tags for descriptions
      const rugTagMap: Record<string, string> = {};
      rugs.forEach((r) => { rugTagMap[r.id] = r.tag; });

      const total = rugServices.reduce((sum, s) => sum + Number(s.line_total), 0);
      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

      // Create invoice
      const { data: invoice, error: invError } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          client_id: selectedClientId,
          status: "draft" as const,
          total,
          pdf_storage_path: `clients/${selectedClientId}/${invoiceNumber}.pdf`,
        })
        .select("id")
        .single();

      if (invError || !invoice) {
        toast({ title: "Failed to create invoice", description: invError?.message, variant: "destructive" });
        setGenerating(false);
        return;
      }

      // Create line items
      const lineItems = rugServices.map((s) => ({
        invoice_id: invoice.id,
        rug_id: s.rug_id,
        description: `${rugTagMap[s.rug_id] ?? "Rug"} — ${s.service_name}`,
        quantity: 1,
        unit_price: Number(s.unit_price),
        total: Number(s.line_total),
      }));

      const { error: itemsError } = await supabase.from("invoice_items").insert(lineItems);

      if (itemsError) {
        toast({ title: "Failed to add line items", description: itemsError.message, variant: "destructive" });
        setGenerating(false);
        return;
      }

      toast({
        title: "Invoice generated",
        description: `${invoiceNumber} — $${total.toFixed(2)} for ${selectedRugIds.size} rug(s)`,
      });

      // Refresh the list
      fetchUninvoicedRugs(selectedClientId);
    } catch {
      toast({ title: "Failed to generate invoice", description: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  if (loadingClients) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingState title="Loading clients" description="Fetching client list..." />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-muted/30 shrink-0">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Invoice Generator</h2>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Client Search */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Select Client</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {!selectedClientId && (
            <div className="max-h-48 overflow-auto border rounded-md divide-y">
              {filteredClients.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3 text-center">No clients found</p>
              ) : (
                filteredClients.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedClientId(c.id);
                      setClientSearch("");
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors"
                  >
                    <p className="text-sm font-medium">{c.name}</p>
                    {c.address && <p className="text-xs text-muted-foreground">{c.address}</p>}
                  </button>
                ))
              )}
            </div>
          )}

          {selectedClient && (
            <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-primary/5">
              <div>
                <p className="text-sm font-medium">{selectedClient.name}</p>
                {selectedClient.address && <p className="text-xs text-muted-foreground">{selectedClient.address}</p>}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedClientId(null);
                  setRugs([]);
                  setSelectedRugIds(new Set());
                }}
              >
                Change
              </Button>
            </div>
          )}
        </div>

        {/* Rugs List */}
        {selectedClientId && (
          <>
            {loadingRugs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : rugs.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No uninvoiced rugs for this client.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {rugs.length} uninvoiced rug{rugs.length !== 1 ? "s" : ""}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={selectAll}>
                      Select All
                    </Button>
                    {selectedRugIds.size > 0 && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={deselectAll}>
                        Clear
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {rugs.map((rug) => (
                    <div
                      key={rug.id}
                      className={`flex items-center gap-3 border rounded-md px-3 py-2.5 transition-colors cursor-pointer ${
                        selectedRugIds.has(rug.id) ? "bg-primary/5 border-primary/30" : "bg-card hover:bg-muted/30"
                      }`}
                      onClick={() => toggleRug(rug.id)}
                    >
                      <Checkbox
                        checked={selectedRugIds.has(rug.id)}
                        onCheckedChange={() => toggleRug(rug.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="font-mono text-sm font-bold text-primary hover:underline"
                            onClick={(e) => { e.stopPropagation(); setDetailRugId(rug.id); }}
                          >
                            {rug.tag}
                          </span>
                          <Badge variant="outline" className="text-[10px] h-4">{rug.status}</Badge>
                          {rug.size_length && rug.size_width && (
                            <span className="text-xs text-muted-foreground">
                              {rug.size_length}×{rug.size_width} ft
                            </span>
                          )}
                        </div>
                        {rug.services.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {rug.services.map((s) => (
                              <Badge key={s} variant="secondary" className="text-[10px] h-4 px-1.5">{s}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-medium text-muted-foreground shrink-0">
                        ${rug.serviceTotal.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Generate button */}
      {selectedRugIds.size > 0 && (
        <div className="border-t px-4 py-3 flex items-center justify-between bg-card shrink-0">
          <div>
            <p className="text-sm font-medium">
              {selectedRugIds.size} rug{selectedRugIds.size !== 1 ? "s" : ""} selected
            </p>
            <p className="text-xs text-muted-foreground">Total: ${selectedTotal.toFixed(2)}</p>
          </div>
          <Button onClick={handleGenerateInvoice} disabled={generating} className="gap-1.5">
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckSquare className="h-4 w-4" />
            )}
            Generate Invoice
          </Button>
        </div>
      )}

      <RugDetailSheet
        rugId={detailRugId}
        open={Boolean(detailRugId)}
        onOpenChange={(open) => { if (!open) setDetailRugId(null); }}
      />
    </div>
  );
}
