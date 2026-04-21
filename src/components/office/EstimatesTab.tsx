import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
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
  type ExtendedTableRow,
} from "@/integrations/supabase/extended";
import { canRoleTransitionEstimateStatus, type EstimateStatus } from "@/lib/workflow-guards";
import type { Tables } from "@/integrations/supabase/types";
import { EstimateStatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime } from "@/lib/date-helpers";
import { MS_PER_DAY } from "@/lib/constants";
import { openOrCreateThread } from "@/lib/thread-navigation";
import { queueEstimateForBatchSend } from "@/lib/notification-cadence-store";
import { getAuthHeaders, safeInvoke } from "@/lib/supabase-helpers";

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
const ESTIMATE_STATUS_SET = new Set<EstimateStatus>(["draft", "needs_office_review", "ready_to_send", "sent", "approved", "rejected", "needs_revision", "expired"]);

type EstimateWorkflowResponse = {
  status: "success";
  mode: "create" | "revise";
  estimateId: string;
  estimateNumber: string;
  version: number;
  total: number;
  rugId: string;
  clientName: string | null;
  rugTag: string | null;
};

export function EstimatesTab() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [rugOptions, setRugOptions] = useState<RugOption[]>([]);
  const [selectedRugId, setSelectedRugId] = useState<string>("none");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sendingEstimateId, setSendingEstimateId] = useState<string | null>(null);
  const [clientDecisionByEstimateId, setClientDecisionByEstimateId] = useState<Record<string, { event_type: string; body: string; created_at: string }>>({});

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

    const estimateList = (estRows ?? []) as unknown as EstimateRow[];
    if (estErr) {
      toast({ title: "Failed to load estimates", description: estErr.message, variant: "destructive" });
    } else {
      setEstimates(estimateList);
    }

    const approvedOrRejectedIds = estimateList.filter((e) => e.status === "approved" || e.status === "rejected").map((e) => e.id);
    if (approvedOrRejectedIds.length > 0) {
      const { data: eventsData } = await supabaseExtended
        .from("communication_events")
        .select("estimate_id, event_type, body, created_at")
        .in("estimate_id", approvedOrRejectedIds)
        .in("event_type", ["estimate_approved_by_client", "estimate_rejected_by_client"])
        .order("created_at", { ascending: false });
      const events = (eventsData ?? []) as { estimate_id: string | null; event_type: string; body: string; created_at: string }[];
      const byEstimate: Record<string, { event_type: string; body: string; created_at: string }> = {};
      events.forEach((ev) => {
        if (ev.estimate_id && !byEstimate[ev.estimate_id]) byEstimate[ev.estimate_id] = ev;
      });
      setClientDecisionByEstimateId(byEstimate);
    } else {
      setClientDecisionByEstimateId({});
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


  const createEstimate = async () => {
    if (selectedRugId === "none") {
      toast({ title: "Select a rug first", variant: "destructive" });
      return;
    }

    setCreating(true);

    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders) {
        toast({ title: "Not signed in", description: "Please sign in again.", variant: "destructive" });
        return;
      }

      const workflow = await safeInvoke<EstimateWorkflowResponse>("estimate-workflow", {
        mode: "create",
        rugId: selectedRugId,
      }, authHeaders);

      if (!workflow.success) {
        toast({ title: "Estimate creation failed", description: workflow.error, variant: "destructive" });
        return;
      }

      toast({ title: "Estimate created", description: `${workflow.data.estimateNumber} created.` });
      setSelectedRugId("none");
      await fetchData();
    } finally {
      setCreating(false);
    }
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

  const reviseEstimate = async (estimate: EstimateRow) => {
    if (estimate.status !== "rejected") return;
    setCreating(true);

    try {
      const authHeaders = await getAuthHeaders();
      if (!authHeaders) {
        toast({ title: "Not signed in", description: "Please sign in again.", variant: "destructive" });
        return;
      }

      const workflow = await safeInvoke<EstimateWorkflowResponse>("estimate-workflow", {
        mode: "revise",
        estimateId: estimate.id,
      }, authHeaders);

      if (!workflow.success) {
        toast({ title: "Revision failed", description: workflow.error, variant: "destructive" });
        return;
      }

      toast({ title: "Revision created", description: `${workflow.data.estimateNumber} is ready to edit and resend.` });
      await fetchData();
    } finally {
      setCreating(false);
    }
  };

  const sendEstimate = async (estimate: EstimateRow) => {
    if (estimate.status !== "ready_to_send") return;
    if (!estimate.client_id) {
      toast({ title: "Cannot queue estimate", description: "This estimate is missing a client link.", variant: "destructive" });
      return;
    }

    setSendingEstimateId(estimate.id);
    try {
      await queueEstimateForBatchSend({
        clientId: estimate.client_id,
        estimateId: estimate.id,
        queuedAt: new Date().toISOString(),
      });
      await fetchData();
      toast({
        title: "Estimate queued",
        description: `${estimate.estimate_number} will send in the daily 3:00 PM Eastern batch.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Queue failed", description: message, variant: "destructive" });
    } finally {
      setSendingEstimateId(null);
    }
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

  const pagination = usePaginatedList(filteredEstimates);

  const openEstimateThread = useCallback(async (estimate: EstimateRow) => {
    if (!estimate.client_id) {
      toast({ title: "No client linked", description: "This estimate does not have a client to message.", variant: "destructive" });
      return;
    }

    try {
      const threadId = await openOrCreateThread({
        clientId: estimate.client_id,
        threadType: "estimate",
        entityId: estimate.id,
      });
      navigate(`/ops?tab=inbox&threadId=${threadId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Could not open thread", description: message, variant: "destructive" });
    }
  }, [navigate, toast]);

  const grouped = useMemo(() => {
    const map: Record<string, EstimateRow[]> = {};
    pagination.items.forEach((e) => {
      if (!map[e.status]) map[e.status] = [];
      map[e.status].push(e);
    });
    return map;
  }, [pagination.items]);

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
              {list.map((estimate) => {
                const clientDecision = clientDecisionByEstimateId[estimate.id];
                const clientNote = clientDecision?.body?.includes("Client note:")
                  ? clientDecision.body.split("Client note:")[1]?.trim()
                  : null;
                return (
                <div key={estimate.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-sm font-medium">{estimate.estimate_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {estimate.clients?.name ?? "Unknown client"} · {estimate.rugs?.tag ?? "Unknown rug"} · ${Number(estimate.total).toFixed(2)}
                      </p>
                    </div>
                    <EstimateStatusBadge status={estimate.status} />
                  </div>

                  {(estimate.status === "needs_office_review" || estimate.status === "ready_to_send") && !estimate.clients?.email?.trim() && (
                    <div className="rounded border border-amber-500/40 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                      Missing client email — add an email on the client record before sending this estimate.
                    </div>
                  )}

                  {(estimate.status === "approved" || estimate.status === "rejected") && (
                    <div className="rounded border bg-muted/40 px-3 py-2 text-xs space-y-1">
                      <p className="text-muted-foreground font-medium">
                        {estimate.status === "approved" && estimate.approved_at && `Client approved ${formatDateTime(estimate.approved_at)}`}
                        {estimate.status === "rejected" && estimate.rejected_at && `Client denied ${formatDateTime(estimate.rejected_at)}`}
                      </p>
                      {clientNote && <p className="text-foreground">Client note: {clientNote}</p>}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => openEstimateThread(estimate)}>
                      Open thread
                    </Button>
                    {estimate.status === "needs_office_review" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => setEstimateStatus(estimate, "ready_to_send")}
                      >
                        Mark ready to send
                      </Button>
                    )}
                    {estimate.status === "ready_to_send" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => sendEstimate(estimate)}
                        disabled={sendingEstimateId === estimate.id || !estimate.clients?.email?.trim()}
                      >
                        {sendingEstimateId === estimate.id ? "Queueing..." : !estimate.clients?.email?.trim() ? "Email required" : "Queue for 3 PM ET"}
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
                    {estimate.status === "rejected" && (
                      <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => reviseEstimate(estimate)} disabled={creating}>
                        {creating ? "Creating..." : "Revise estimate"}
                      </Button>
                    )}
                    {estimate.status === "needs_revision" && (
                      <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => setEstimateStatus(estimate, "needs_office_review")}>
                        Return to office review
                      </Button>
                    )}
                    {(estimate.status === "needs_office_review" || estimate.status === "ready_to_send" || estimate.status === "sent" || estimate.status === "needs_revision") && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEstimateStatus(estimate, "expired")}>
                        Mark expired
                      </Button>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          </section>
        ))
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        hasPrev={pagination.hasPrev}
        hasNext={pagination.hasNext}
        onPrev={pagination.prevPage}
        onNext={pagination.nextPage}
        label="estimates"
      />
    </div>
  );
}
