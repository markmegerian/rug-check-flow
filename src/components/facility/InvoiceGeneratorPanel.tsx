import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, FileText, Loader2, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/states/PageState";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { RugDetailSheet } from "./RugDetailSheet";
import { applyCleaningServiceMinimum } from "@/lib/service-pricing";
import { getAuthHeaders, safeInvoke } from "@/lib/supabase-helpers";

type ClientOption = {
  id: string;
  name: string;
  address: string;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
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
  cleaningMinimumApplied: boolean;
};

type GenerateInvoiceWorkflowResponse = {
  status: "success";
  invoiceId: string;
  invoiceNumber: string;
  total: number;
  clientId: string;
  clientName: string;
  rugIds: string[];
  rugCount: number;
};

export function InvoiceGeneratorPanel() {
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [rugs, setRugs] = useState<UninvoicedRug[]>([]);
  const [selectedRugIds, setSelectedRugIds] = useState<Set<string>>(new Set());
  const [loadingRugs, setLoadingRugs] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [detailRugId, setDetailRugId] = useState<string | null>(null);

  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ["clients", "invoice-generator-search", clientSearch.trim()],
    queryFn: async () => {
      const term = clientSearch.trim().replace(/,/g, " ");
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, address, contact_name, phone, email")
        .or([
          `name.ilike.%${term}%`,
          `contact_name.ilike.%${term}%`,
          `phone.ilike.%${term}%`,
          `email.ilike.%${term}%`,
        ].join(","))
        .order("name")
        .limit(12);
      if (error) {
        toast({ title: "Failed to load clients", description: error.message, variant: "destructive" });
        return [] as ClientOption[];
      }
      return (data ?? []) as ClientOption[];
    },
    enabled: !selectedClientId && clientSearch.trim().length >= 2,
    staleTime: 30_000,
  });

  // Fetch uninvoiced rugs for selected client
  const fetchUninvoicedRugs = useCallback(async (clientId: string) => {
    setLoadingRugs(true);
    setSelectedRugIds(new Set());

    // 1. Get ready rugs for this client that are available for walk-in pickup invoicing
    const { data: rugsData, error: rugsError } = await supabase
      .from("rugs")
      .select("id, tag, description, status, size_length, size_width, services")
      .eq("client_id", clientId)
      .eq("status", "ready")
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
      .select("rug_id, service_id, line_total")
      .in("rug_id", uninvoicedIds);

    const serviceIds = Array.from(new Set((rugServices ?? []).map((s) => s.service_id).filter(Boolean)));
    let categoryByServiceId: Record<string, string> = {};
    if (serviceIds.length > 0) {
      const { data: serviceRows } = await supabase
        .from("services")
        .select("id, category")
        .in("id", serviceIds);
      categoryByServiceId = Object.fromEntries((serviceRows ?? []).map((row) => [row.id, row.category ?? ""]));
    }

    const serviceTotalByRug: Record<string, number> = {};
    const cleaningMinimumByRug: Record<string, boolean> = {};
    (rugServices ?? []).forEach((s) => {
      const rawTotal = Number(s.line_total);
      const adjustedTotal = applyCleaningServiceMinimum(rawTotal, categoryByServiceId[s.service_id] ?? null);
      serviceTotalByRug[s.rug_id] = (serviceTotalByRug[s.rug_id] ?? 0) + adjustedTotal;
      if (adjustedTotal > rawTotal) cleaningMinimumByRug[s.rug_id] = true;
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
        cleaningMinimumApplied: Boolean(cleaningMinimumByRug[r.id]),
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
      setSelectedClient(null);
    }
  }, [selectedClientId, fetchUninvoicedRugs]);

  const filteredClients = clients;

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

  const selectedMinimumAdjustedCount = useMemo(
    () => rugs.filter((r) => selectedRugIds.has(r.id) && r.cleaningMinimumApplied).length,
    [rugs, selectedRugIds],
  );

  const handleGenerateInvoice = async () => {
    if (!selectedClientId || selectedRugIds.size === 0) return;

    setGenerating(true);
    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders) {
        toast({ title: "Not signed in", description: "Please sign in again.", variant: "destructive" });
        return;
      }

      const workflow = await safeInvoke<GenerateInvoiceWorkflowResponse>("generate-invoice-workflow", {
        clientId: selectedClientId,
        rugIds: Array.from(selectedRugIds),
      }, authHeaders);

      if (!workflow.success) {
        toast({ title: "Failed to generate invoice", description: workflow.error, variant: "destructive" });
        return;
      }

      toast({
        title: "Handoff invoice generated",
        description: `${workflow.data.invoiceNumber} — $${workflow.data.total.toFixed(2)} for ${workflow.data.rugCount} ready rug(s). Pickup handoff remains a separate action.`,
      });

      fetchUninvoicedRugs(selectedClientId);
    } catch {
      toast({ title: "Failed to generate invoice", description: "An unexpected error occurred", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (loadingClients && !selectedClientId) {
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
        <h2 className="text-sm font-semibold">Walk-In / On-Site Pickup Invoicing</h2>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="rounded-lg border bg-card p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Billing before handoff</p>
          <p className="mt-1">Search the client, select ready rugs that are being handed off on-site, and generate the invoice before pickup. This does not itself mark rugs picked up.</p>
        </div>

        {/* Client Search */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Select Client</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by client, contact, phone, or email..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {!selectedClientId && clientSearch.trim().length < 2 && (
            <p className="text-xs text-muted-foreground">Type at least 2 characters to search clients.</p>
          )}

          {!selectedClientId && clientSearch.trim().length >= 2 && (
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
                      setSelectedClient(c);
                      setClientSearch("");
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-accent/50 transition-colors"
                  >
                    <p className="text-sm font-medium">{c.name}</p>
                    {(c.contact_name || c.phone || c.email) && (
                      <p className="text-xs text-muted-foreground">
                        {[c.contact_name, c.phone, c.email].filter(Boolean).join(" · ")}
                      </p>
                    )}
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
                {(selectedClient.contact_name || selectedClient.phone || selectedClient.email) && (
                  <p className="text-xs text-muted-foreground">
                    {[selectedClient.contact_name, selectedClient.phone, selectedClient.email].filter(Boolean).join(" · ")}
                  </p>
                )}
                {selectedClient.address && <p className="text-xs text-muted-foreground">{selectedClient.address}</p>}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedClientId(null);
                  setSelectedClient(null);
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
                <p className="text-sm text-muted-foreground">No uninvoiced ready rugs are available for handoff for this client.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {rugs.length} uninvoiced ready rug{rugs.length !== 1 ? "s" : ""} available for handoff
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
                          {rug.cleaningMinimumApplied && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">$35 min</Badge>
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
            {selectedMinimumAdjustedCount > 0 && (
              <p className="text-xs text-muted-foreground">Includes $35 cleaning minimum on {selectedMinimumAdjustedCount} rug{selectedMinimumAdjustedCount !== 1 ? "s" : ""}.</p>
            )}
          </div>
          <Button onClick={handleGenerateInvoice} disabled={generating} className="gap-1.5">
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckSquare className="h-4 w-4" />
            )}
            Generate Handoff Invoice
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
