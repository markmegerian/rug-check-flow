import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  supabaseExtended,
  type ExtendedTableInsert,
  type ExtendedTableRow,
} from "@/integrations/supabase/extended";
import { canRoleTransitionEstimateStatus, type EstimateStatus } from "@/lib/workflow-guards";
import type { Tables } from "@/integrations/supabase/types";

type EstimateRow = {
  id: ExtendedTableRow<"estimates">["id"];
  rug_id: ExtendedTableRow<"estimates">["rug_id"];
  client_id: ExtendedTableRow<"estimates">["client_id"];
  estimate_number: ExtendedTableRow<"estimates">["estimate_number"];
  status: ExtendedTableRow<"estimates">["status"];
  version: ExtendedTableRow<"estimates">["version"];
  total: ExtendedTableRow<"estimates">["total"];
  created_at: ExtendedTableRow<"estimates">["created_at"];
  sent_at: ExtendedTableRow<"estimates">["sent_at"];
  approved_at: ExtendedTableRow<"estimates">["approved_at"];
  rejected_at: ExtendedTableRow<"estimates">["rejected_at"];
  clients?: Pick<Tables<"clients">, "name" | "email"> | null;
  rugs?: Pick<Tables<"rugs">, "tag"> | null;
};

type RugOption = {
  id: Tables<"rugs">["id"];
  tag: Tables<"rugs">["tag"];
  client_id: Tables<"rugs">["client_id"];
  clients?: Pick<Tables<"clients">, "name" | "email"> | null;
};
type RugServiceSnapshot = Pick<Tables<"rug_services">, "id" | "service_name" | "unit_price" | "line_total">;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ESTIMATE_STATUS_SET = new Set<EstimateStatus>(["draft", "sent", "approved", "rejected", "expired"]);

export function EstimatesTab() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [rugOptions, setRugOptions] = useState<RugOption[]>([]);
  const [selectedRugId, setSelectedRugId] = useState<string>("none");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sendingEstimateId, setSendingEstimateId] = useState<string | null>(null);

  const statusParam = searchParams.get("status");
  const minAgeDays = Number(searchParams.get("minAgeDays") ?? 0);
  const statusFilter: EstimateStatus | "all" =
    statusParam && ESTIMATE_STATUS_SET.has(statusParam as EstimateStatus)
      ? (statusParam as EstimateStatus)
      : "all";
  const hasReminderFilter = statusFilter !== "all" || minAgeDays > 0;

  const fetchData = useCallback(async () => {
    const { data: estRows, error: estErr } = await supabaseExtended
      .from("estimates")
      .select("id, rug_id, client_id, estimate_number, status, version, total, created_at, sent_at, approved_at, rejected_at, clients(name,email), rugs(tag)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (estErr) {
      toast({ title: "Failed to load estimates", description: estErr.message, variant: "destructive" });
    } else {
      setEstimates((estRows ?? []) as unknown as EstimateRow[]);
    }

    const { data: rugsData } = await supabaseExtended
      .from("rugs")
      .select("id, tag, client_id, clients(name)")
      .in("status", ["checked_in", "in_production", "ready"])
      .order("checked_in_at", { ascending: false })
      .limit(200);

    setRugOptions((rugsData ?? []) as unknown as RugOption[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const statusBadge = (status: EstimateStatus) => {
    if (status === "draft") return <Badge variant="outline">Draft</Badge>;
    if (status === "sent") return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Sent</Badge>;
    if (status === "approved") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Approved</Badge>;
    if (status === "rejected") return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Rejected</Badge>;
    return <Badge variant="secondary">Expired</Badge>;
  };

  const createEstimate = async () => {
    if (selectedRugId === "none") {
      toast({ title: "Select a rug first", variant: "destructive" });
      return;
    }

    const selectedRug = rugOptions.find((r) => r.id === selectedRugId);
    if (!selectedRug) return;

    setCreating(true);

    const { data: serviceRows, error: svcErr } = await supabaseExtended
      .from("rug_services")
      .select("id, service_name, unit_price, line_total")
      .eq("rug_id", selectedRugId);

    if (svcErr) {
      toast({ title: "Failed to load rug services", description: svcErr.message, variant: "destructive" });
      setCreating(false);
      return;
    }

    const services = (serviceRows ?? []) as RugServiceSnapshot[];
    if (services.length === 0) {
      toast({ title: "No service snapshots", description: "This rug has no captured service pricing yet.", variant: "destructive" });
      setCreating(false);
      return;
    }

    const total = services.reduce((sum, service) => sum + Number(service.line_total ?? 0), 0);
    const estimateNumber = `EST-${Date.now().toString(36).toUpperCase()}`;

    const { data: insertedEstimate, error: estErr } = await supabaseExtended
      .from("estimates")
      .insert({
        rug_id: selectedRugId,
        client_id: selectedRug.client_id,
        estimate_number: estimateNumber,
        status: "draft",
        version: 1,
        total,
      })
      .select("id")
      .single();

    if (estErr || !insertedEstimate) {
      toast({ title: "Estimate creation failed", description: estErr?.message ?? "Unknown error", variant: "destructive" });
      setCreating(false);
      return;
    }

    const items: ExtendedTableInsert<"estimate_items">[] = services.map((service) => ({
      estimate_id: insertedEstimate.id,
      rug_service_id: service.id,
      description: `${selectedRug.tag} — ${service.service_name}`,
      quantity: 1,
      unit_price: Number(service.unit_price ?? 0),
      total: Number(service.line_total ?? 0),
    }));

    const { error: itemErr } = await supabaseExtended.from("estimate_items").insert(items);
    if (itemErr) {
      await supabaseExtended.from("estimates").delete().eq("id", insertedEstimate.id);
      toast({ title: "Estimate items failed", description: itemErr.message, variant: "destructive" });
      setCreating(false);
      return;
    }

    await logCommunicationEvent({
      id: insertedEstimate.id,
      rug_id: selectedRugId,
      client_id: selectedRug.client_id,
      estimate_number: estimateNumber,
      status: "draft",
      version: 1,
      total,
      created_at: new Date().toISOString(),
      sent_at: null,
      approved_at: null,
      rejected_at: null,
      clients: { name: selectedRug.clients?.name ?? "", email: null },
      rugs: { tag: selectedRug.tag },
    }, "estimate_created", `${estimateNumber} created`, `Estimate ${estimateNumber} created from service snapshot.`);

    toast({ title: "Estimate created", description: `${estimateNumber} created.` });
    setSelectedRugId("none");
    await fetchData();
    setCreating(false);
  };


  const logCommunicationEvent = async (estimate: EstimateRow, eventType: string, subject: string, body: string) => {
    const { error } = await supabaseExtended.from("communication_events").insert({
      client_id: estimate.client_id,
      rug_id: estimate.rug_id,
      estimate_id: estimate.id,
      channel: "email",
      direction: "outbound",
      event_type: eventType,
      subject,
      body,
      sent_to: estimate.clients?.email ?? null,
    });

    if (error) {
      toast({
        title: "Communication event logging failed",
        description: error.message,
        variant: "destructive",
      });
    }

    return !error;
  };

  const sendEstimate = async (estimate: EstimateRow) => {
    if (estimate.status !== "draft") return;

    setSendingEstimateId(estimate.id);

    type SendEstimateResponse = {
      success?: boolean;
      provider_status?: string;
      provider_response?: unknown;
      error?: string;
      details?: unknown;
    };

    const { data, error } = await supabaseExtended.functions.invoke<SendEstimateResponse>("send-estimate-email", {
      body: { estimate_id: estimate.id },
    });

    if (error || data?.error) {
      toast({
        title: "Estimate send failed",
        description: data?.error || error?.message || "Unknown error",
        variant: "destructive",
      });
      setSendingEstimateId(null);
      return;
    }

    await fetchData();
    setSendingEstimateId(null);
    toast({
      title: "Estimate sent",
      description:
        data?.provider_status === "sent"
          ? `${estimate.estimate_number} email delivered to client.`
          : `${estimate.estimate_number} marked sent (email provider not configured).`,
    });
  };

  const setEstimateStatus = async (estimate: EstimateRow, status: EstimateStatus) => {
    if (!canRoleTransitionEstimateStatus("office", estimate.status, status)) {
      toast({
        title: "Invalid status transition",
        description: `Cannot move estimate from ${estimate.status} to ${status}.`,
        variant: "destructive",
      });
      return;
    }

    const updates: Partial<ExtendedTableRow<"estimates">> = { status };
    if (status === "approved") updates.approved_at = new Date().toISOString();
    if (status === "rejected") updates.rejected_at = new Date().toISOString();

    const { error } = await supabaseExtended
      .from("estimates")
      .update(updates)
      .eq("id", estimate.id);

    if (error) {
      toast({ title: "Status update failed", description: error.message, variant: "destructive" });
      return;
    }

    const updatedEstimate = { ...estimate, ...updates } as EstimateRow;
    setEstimates((prev) => prev.map((e) => (e.id === estimate.id ? updatedEstimate : e)));

    const baseSubject = `${estimate.estimate_number} ${status}`;
    const baseBody = `Estimate ${estimate.estimate_number} for ${estimate.clients?.name ?? "client"} is now ${status}.`;
    await logCommunicationEvent(updatedEstimate, `estimate_${status}`, baseSubject, baseBody);

    toast({ title: `Estimate ${status}` });
  };

  const filteredEstimates = useMemo(() => {
    let next = [...estimates];
    if (statusFilter !== "all") {
      next = next.filter((estimate) => estimate.status === statusFilter);
    }
    if (minAgeDays > 0) {
      next = next.filter((estimate) => {
        const ageMs = Date.now() - Date.parse(estimate.created_at);
        if (!Number.isFinite(ageMs)) return false;
        return ageMs >= minAgeDays * MS_PER_DAY;
      });
    }
    return next;
  }, [estimates, minAgeDays, statusFilter]);

  const grouped = useMemo(() => {
    const map: Record<string, EstimateRow[]> = {};
    filteredEstimates.forEach((e) => {
      if (!map[e.status]) map[e.status] = [];
      map[e.status].push(e);
    });
    return map;
  }, [filteredEstimates]);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading estimates…</div>;
  }

  return (
    <div className="p-4 md:p-6 overflow-auto h-full space-y-5 animate-fade-in-up">
      {hasReminderFilter ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Reminder filter active:
          {statusFilter !== "all" ? ` status=${statusFilter}` : ""}
          {minAgeDays > 0 ? ` · min age ${minAgeDays} days` : ""}
        </div>
      ) : null}
      <h2 className="text-lg font-semibold text-foreground">Estimates</h2>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-sm font-medium">Create estimate from checked-in rug snapshot</h3>
        <div className="flex flex-wrap gap-2">
          <Select value={selectedRugId} onValueChange={setSelectedRugId}>
            <SelectTrigger className="w-[320px]">
              <SelectValue placeholder="Select rug" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Select rug</SelectItem>
              {rugOptions.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.tag} · {r.clients?.name ?? "Unknown client"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={createEstimate} disabled={creating || selectedRugId === "none"}>
            {creating ? "Creating…" : "Create Estimate"}
          </Button>
        </div>
      </section>

      {Object.entries(grouped).length === 0 ? (
        <p className="text-sm text-muted-foreground">No estimates created yet.</p>
      ) : (
        Object.entries(grouped).map(([status, list]) => (
          <section key={status} className="border rounded-lg bg-card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <h3 className="font-medium text-sm capitalize">{status}</h3>
              <Badge variant="secondary" className="text-xs">{list.length}</Badge>
            </div>
            <Separator />
            <div className="divide-y">
              {list.map((estimate) => (
                <div key={estimate.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-sm font-medium">{estimate.estimate_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {estimate.clients?.name ?? "Unknown client"} · {estimate.rugs?.tag ?? "Unknown rug"} · ${Number(estimate.total).toFixed(2)}
                      </p>
                    </div>
                    {statusBadge(estimate.status)}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {estimate.status === "draft" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => sendEstimate(estimate)}
                        disabled={sendingEstimateId === estimate.id}
                      >
                        {sendingEstimateId === estimate.id ? "Sending..." : "Mark sent"}
                      </Button>
                    )}
                    {estimate.status === "sent" && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEstimateStatus(estimate, "approved")}>
                          Mark approved
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEstimateStatus(estimate, "rejected")}>
                          Mark rejected
                        </Button>
                      </>
                    )}
                    {(estimate.status === "draft" || estimate.status === "sent") && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEstimateStatus(estimate, "expired")}>
                        Mark expired
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
