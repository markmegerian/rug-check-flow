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
  clients?: Pick<Tables<"clients">, "name" | "email" | "company"> | null;
  rugs?: Pick<Tables<"rugs">, "tag"> | null;
};

const STATUS_ORDER: EstimateStatus[] = ["needs_office_review", "needs_revision", "ready_to_send", "sent", "approved", "rejected", "expired", "draft"];

const STATUS_LABELS: Partial<Record<EstimateStatus, string>> = {
  needs_office_review: "Needs office review",
  needs_revision: "Needs revision",
  ready_to_send: "Ready to send",
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
  const [bulkQueueingGroupKey, setBulkQueueingGroupKey] = useState<string | null>(null);
  const [bulkReviewingGroupKey, setBulkReviewingGroupKey] = useState<string | null>(null);
  const [bulkExpiringGroupKey, setBulkExpiringGroupKey] = useState<string | null>(null);
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
      .select("id, rug_id, client_id, estimate_number, status, version, total, created_at, sent_at, approved_at, rejected_at, clients(name,email,company), rugs(tag)")
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

  const moveGroupToReady = useCallback(async (groupName: string, estimatesInGroup: EstimateRow[]) => {
    const reviewEstimates = estimatesInGroup.filter((estimate) => estimate.status === "needs_office_review");

    if (reviewEstimates.length === 0) {
      toast({ title: "No review estimates", description: "This client group has no estimates waiting for office review.", variant: "destructive" });
      return;
    }

    setBulkReviewingGroupKey(groupName);
    try {
      const updates = reviewEstimates.map((estimate) =>
        supabaseExtended
          .from("estimates")
          .update({ status: "ready_to_send" })
          .eq("id", estimate.id),
      );

      const results = await Promise.all(updates);
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        toast({ title: "Group review update failed", description: failed.error.message, variant: "destructive" });
        return;
      }

      await Promise.all(reviewEstimates.map((estimate) => logCommunicationEvent(
        { ...estimate, status: "ready_to_send" } as EstimateRow,
        "estimate_ready_to_send",
        `${estimate.estimate_number} ready to send`,
        `Estimate ${estimate.estimate_number} for ${estimate.clients?.name ?? "client"} is ready to send.`,
      )));

      await fetchData();
      toast({ title: "Group ready to send", description: `${reviewEstimates.length} estimate${reviewEstimates.length === 1 ? "" : "s"} from ${groupName} moved to ready to send.` });
    } finally {
      setBulkReviewingGroupKey(null);
    }
  }, [fetchData, toast]);

  const expireEstimateGroup = useCallback(async (groupName: string, estimatesInGroup: EstimateRow[]) => {
    const expirable = estimatesInGroup.filter((estimate) => ["needs_office_review", "ready_to_send", "sent", "needs_revision"].includes(estimate.status));

    if (expirable.length === 0) {
      toast({ title: "No expirable estimates", description: "This client group has no active estimates that can be expired.", variant: "destructive" });
      return;
    }

    setBulkExpiringGroupKey(groupName);
    try {
      const nowIso = new Date().toISOString();
      const updates = expirable.map((estimate) =>
        supabaseExtended
          .from("estimates")
          .update({ status: "expired" })
          .eq("id", estimate.id),
      );

      const results = await Promise.all(updates);
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        toast({ title: "Group expire failed", description: failed.error.message, variant: "destructive" });
        return;
      }

      await Promise.all(expirable.map((estimate) => logCommunicationEvent(
        { ...estimate, status: "expired" } as EstimateRow,
        "estimate_expired",
        `${estimate.estimate_number} expired`,
        `Estimate ${estimate.estimate_number} for ${estimate.clients?.name ?? "client"} was marked expired on ${formatDateTime(nowIso)}.`,
      )));

      await fetchData();
      toast({ title: "Group expired", description: `${expirable.length} estimate${expirable.length === 1 ? "" : "s"} from ${groupName} marked expired.` });
    } finally {
      setBulkExpiringGroupKey(null);
    }
  }, [fetchData, toast]);

  const queueEstimateGroup = useCallback(async (groupName: string, estimatesInGroup: EstimateRow[]) => {
    const readyEstimates = estimatesInGroup.filter((estimate) => estimate.status === "ready_to_send");

    if (readyEstimates.length === 0) {
      toast({ title: "No ready estimates", description: "This client group has no estimates ready for the batch send.", variant: "destructive" });
      return;
    }

    const missingClientLink = readyEstimates.find((estimate) => !estimate.client_id);
    if (missingClientLink) {
      toast({ title: "Cannot queue group", description: `${missingClientLink.estimate_number} is missing a client link.`, variant: "destructive" });
      return;
    }

    const missingEmail = readyEstimates.filter((estimate) => !estimate.clients?.email?.trim());
    if (missingEmail.length > 0) {
      toast({ title: "Client email required", description: `Add a client email before queueing ${missingEmail.length} ready estimate${missingEmail.length === 1 ? "" : "s"} in ${groupName}.`, variant: "destructive" });
      return;
    }

    setBulkQueueingGroupKey(groupName);
    try {
      const queuedAt = new Date().toISOString();
      await Promise.all(readyEstimates.map((estimate) => queueEstimateForBatchSend({
        clientId: estimate.client_id!,
        estimateId: estimate.id,
        queuedAt,
      })));
      await fetchData();
      toast({ title: "Estimate group queued", description: `${readyEstimates.length} estimate${readyEstimates.length === 1 ? "" : "s"} from ${groupName} will send in the daily 3:00 PM Eastern batch.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Group queue failed", description: message, variant: "destructive" });
    } finally {
      setBulkQueueingGroupKey(null);
    }
  }, [fetchData, toast]);

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
    const statusMap = new Map<string, Map<string, EstimateRow[]>>();

    pagination.items.forEach((estimate) => {
      const statusKey = estimate.status;
      const companyName = estimate.clients?.company?.trim();
      const clientName = estimate.clients?.name?.trim() || "Unknown client";
      const groupKey = companyName ? `${companyName} · ${clientName}` : clientName;

      if (!statusMap.has(statusKey)) statusMap.set(statusKey, new Map());
      const clientMap = statusMap.get(statusKey)!;
      if (!clientMap.has(groupKey)) clientMap.set(groupKey, []);
      clientMap.get(groupKey)!.push(estimate);
    });

    return STATUS_ORDER
      .filter((status) => statusMap.has(status))
      .map((status) => ({
        status,
        label: STATUS_LABELS[status] ?? status,
        groups: Array.from(statusMap.get(status)!.entries()).map(([groupName, estimates]) => ({
          groupName,
          estimates,
        })),
      }));
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

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">No estimates created yet.</p>
      ) : (
        grouped.map(({ status, label, groups }) => (
          <section key={status} className="border rounded-lg bg-card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <h3 className="font-medium text-sm">{label}</h3>
              <Badge variant="secondary" className="text-xs">{groups.reduce((sum, group) => sum + group.estimates.length, 0)}</Badge>
            </div>
            <Separator />
            <div>
              {groups.map((group, groupIndex) => (
                <div key={`${status}-${group.groupName}`} className={groupIndex > 0 ? "border-t" : ""}>
                  <div className="px-4 py-3 bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-foreground">{group.groupName}</p>
                      <p className="text-xs text-muted-foreground">{group.estimates.length} estimate{group.estimates.length === 1 ? "" : "s"}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                        <span>{group.estimates.filter((estimate) => estimate.status === "needs_office_review").length} in review</span>
                        <span>•</span>
                        <span>{group.estimates.filter((estimate) => estimate.status === "ready_to_send").length} ready</span>
                        <span>•</span>
                        <span>{group.estimates.filter((estimate) => estimate.status === "sent").length} sent</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => moveGroupToReady(group.groupName, group.estimates)}
                        disabled={bulkReviewingGroupKey === group.groupName || !group.estimates.some((estimate) => estimate.status === "needs_office_review")}
                      >
                        {bulkReviewingGroupKey === group.groupName ? "Updating..." : "Mark review group ready"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => queueEstimateGroup(group.groupName, group.estimates)}
                        disabled={bulkQueueingGroupKey === group.groupName || !group.estimates.some((estimate) => estimate.status === "ready_to_send")}
                      >
                        {bulkQueueingGroupKey === group.groupName ? "Queueing..." : "Queue ready group"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => expireEstimateGroup(group.groupName, group.estimates)}
                        disabled={bulkExpiringGroupKey === group.groupName || !group.estimates.some((estimate) => ["needs_office_review", "ready_to_send", "sent", "needs_revision"].includes(estimate.status))}
                      >
                        {bulkExpiringGroupKey === group.groupName ? "Expiring..." : "Expire active group"}
                      </Button>
                    </div>
                  </div>
                  <div className="divide-y">
                    {group.estimates.map((estimate) => {
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
                              Missing client email, add an email on the client record before sending this estimate.
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
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => setSelectedRugId(estimate.rug_id ?? "none")}
                              disabled={!estimate.rug_id}
                            >
                              Select rug
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
                </div>
              ))}
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
