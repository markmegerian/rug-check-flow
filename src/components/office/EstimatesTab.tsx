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
import { getAuthHeaders, safeInvoke } from "@/lib/supabase-helpers";
import {
  fetchEstimateAttentionGroupDetails,
  fetchEstimateAttentionGroups,
  type EstimateAttentionGroupRow,
} from "@/lib/estimate-attention-groups";
import {
  expireEstimateGroup as expireEstimateGroupBatch,
  markEstimateGroupReady,
  queueEstimateGroupBatch,
  transitionEstimateStatus,
} from "@/lib/estimate-group-actions";
import {
  cancelEstimateSendBatch,
  fetchEstimateSendBatchSummaries,
  requeueEstimateSendBatch,
  type EstimateSendBatchSummary,
} from "@/lib/estimate-send-batches";

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

type EstimateAttentionGroupSummary = EstimateAttentionGroupRow & {
  groupName: string;
};

const ESTIMATE_STATUS_SET = new Set<EstimateStatus>(["draft", "needs_office_review", "ready_to_send", "sent", "approved", "rejected", "needs_revision", "expired"]);
const ACTIVE_ATTENTION_STATUSES: EstimateStatus[] = ["needs_office_review", "needs_revision", "ready_to_send"];
const ACTIVE_ATTENTION_STATUS_SET = new Set<EstimateStatus>(ACTIVE_ATTENTION_STATUSES);
const MANAGEMENT_STATUS_ORDER: EstimateStatus[] = ["sent", "approved", "rejected", "expired", "draft"];

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
  const [attentionGroups, setAttentionGroups] = useState<EstimateAttentionGroupSummary[]>([]);
  const [selectedRugId, setSelectedRugId] = useState<string>("none");
  const [estimateSendBatches, setEstimateSendBatches] = useState<EstimateSendBatchSummary[]>([]);
  const [mutatingBatchId, setMutatingBatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sendingEstimateId, setSendingEstimateId] = useState<string | null>(null);
  const [bulkQueueingGroupKey, setBulkQueueingGroupKey] = useState<string | null>(null);
  const [bulkReviewingGroupKey, setBulkReviewingGroupKey] = useState<string | null>(null);
  const [bulkExpiringGroupKey, setBulkExpiringGroupKey] = useState<string | null>(null);
  const [clientDecisionByEstimateId, setClientDecisionByEstimateId] = useState<Record<string, { event_type: string; body: string; created_at: string }>>({});
  const [attentionDetailByClientId, setAttentionDetailByClientId] = useState<Record<string, EstimateRow[]>>({});
  const [loadingAttentionClientId, setLoadingAttentionClientId] = useState<string | null>(null);

  const statusParam = searchParams.get("status");
  const minAgeDays = Number(searchParams.get("minAgeDays") ?? 0);
  const statusFilter: EstimateStatus | "all" =
    statusParam && ESTIMATE_STATUS_SET.has(statusParam as EstimateStatus)
      ? (statusParam as EstimateStatus)
      : "all";
  const hasReminderFilter = statusFilter !== "all" || minAgeDays > 0;

  const fetchData = useCallback(async () => {
    setAttentionDetailByClientId({});

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

    try {
      const groupRows = await fetchEstimateAttentionGroups();
      setAttentionGroups(groupRows.map((row) => ({
        ...row,
        groupName: row.company_name?.trim()
          ? `${row.company_name} · ${row.client_name ?? "Unknown client"}`
          : (row.client_name ?? "Unknown client"),
      })));

      const batchRows = await fetchEstimateSendBatchSummaries();
      setEstimateSendBatches(batchRows);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load estimate attention groups";
      toast({ title: "Estimate attention summary failed", description: message, variant: "destructive" });
      setAttentionGroups([]);
    }

    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const resolveAttentionGroupEstimates = useCallback(async (clientId: string | null, fallback: EstimateRow[]) => {
    if (!clientId) return fallback;

    try {
      const detailRows = await fetchEstimateAttentionGroupDetails(clientId);
      return detailRows.map((row) => ({
        id: row.id,
        rug_id: row.rug_id,
        client_id: row.client_id,
        estimate_number: row.estimate_number,
        status: row.status,
        version: row.version,
        total: row.total,
        created_at: row.created_at,
        sent_at: row.sent_at,
        approved_at: row.approved_at,
        rejected_at: row.rejected_at,
        clients: {
          name: row.client_name ?? null,
          email: row.client_email ?? null,
          company: row.company_name ?? null,
        },
        rugs: {
          tag: row.rug_tag ?? null,
        },
      } satisfies EstimateRow));
    } catch {
      return fallback;
    }
  }, []);

  const handleCancelBatch = useCallback(async (batch: EstimateSendBatchSummary) => {
    setMutatingBatchId(batch.batch_id);
    try {
      const updatedCount = await cancelEstimateSendBatch(batch.batch_id);
      await fetchData();
      toast({
        title: updatedCount > 0 ? "Batch cancelled" : "No queued batch to cancel",
        description: updatedCount > 0
          ? `${batch.client_name ?? "Client"} batch was cancelled.`
          : `This batch was already no longer queued.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Batch cancel failed", description: message, variant: "destructive" });
    } finally {
      setMutatingBatchId(null);
    }
  }, [fetchData, toast]);

  const handleRequeueBatch = useCallback(async (batch: EstimateSendBatchSummary) => {
    setMutatingBatchId(batch.batch_id);
    try {
      const updatedCount = await requeueEstimateSendBatch(batch.batch_id);
      await fetchData();
      toast({
        title: updatedCount > 0 ? "Batch requeued" : "Batch requeue skipped",
        description: updatedCount > 0
          ? `${batch.client_name ?? "Client"} batch was requeued.`
          : `This batch could not be requeued.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Batch requeue failed", description: message, variant: "destructive" });
    } finally {
      setMutatingBatchId(null);
    }
  }, [fetchData, toast]);

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
      const queuedCount = await queueEstimateGroupBatch([estimate]);
      await fetchData();
      toast({
        title: queuedCount > 0 ? "Estimate queued" : "Estimate queue skipped",
        description: queuedCount > 0
          ? `${estimate.estimate_number} will send in the daily 3:00 PM Eastern batch.`
          : `${estimate.estimate_number} could not be queued.`,
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

    try {
      if (status === "ready_to_send") {
        await markEstimateGroupReady([estimate]);
      } else if (status === "expired") {
        await expireEstimateGroupBatch([estimate]);
      } else if (status === "approved" || status === "rejected" || status === "needs_office_review") {
        const result = await transitionEstimateStatus({
          estimateId: estimate.id,
          nextStatus: status,
        });

        if (result.updatedCount <= 0) {
          toast({ title: "Status update skipped", description: `${estimate.estimate_number} could not be updated.`, variant: "destructive" });
          return;
        }
      } else {
        toast({ title: "Unsupported action", description: `No backend transition is configured for ${status}.`, variant: "destructive" });
        return;
      }

      await fetchData();
      toast({ title: `Estimate ${status}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Status update failed", description: message, variant: "destructive" });
    }
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

  const attentionEstimateCount = useMemo(
    () => attentionGroups.reduce((sum, group) => sum + group.estimate_count, 0),
    [attentionGroups],
  );

  const readyAttentionCount = useMemo(
    () => attentionGroups.reduce((sum, group) => sum + group.ready_count, 0),
    [attentionGroups],
  );

  const moveGroupToReady = useCallback(async (groupName: string, clientId: string | null, estimatesInGroup: EstimateRow[]) => {
    const resolvedEstimates = await resolveAttentionGroupEstimates(clientId, estimatesInGroup);
    const reviewEstimates = resolvedEstimates.filter((estimate) => estimate.status === "needs_office_review");

    if (reviewEstimates.length === 0) {
      toast({ title: "No review estimates", description: "This client group has no estimates waiting for office review.", variant: "destructive" });
      return;
    }

    setBulkReviewingGroupKey(groupName);
    try {
      const movedCount = await markEstimateGroupReady(reviewEstimates);
      await fetchData();
      toast({ title: "Group ready to send", description: `${movedCount} estimate${movedCount === 1 ? "" : "s"} from ${groupName} moved to ready to send.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Group review update failed", description: message, variant: "destructive" });
    } finally {
      setBulkReviewingGroupKey(null);
    }
  }, [fetchData, resolveAttentionGroupEstimates, toast]);

  const handleExpireEstimateGroup = useCallback(async (groupName: string, clientId: string | null, estimatesInGroup: EstimateRow[]) => {
    const resolvedEstimates = await resolveAttentionGroupEstimates(clientId, estimatesInGroup);
    const expirable = resolvedEstimates.filter((estimate) => ["needs_office_review", "ready_to_send", "needs_revision"].includes(estimate.status));

    if (expirable.length === 0) {
      toast({ title: "No expirable estimates", description: "This client group has no active estimates that can be expired.", variant: "destructive" });
      return;
    }

    setBulkExpiringGroupKey(groupName);
    try {
      const expiredCount = await expireEstimateGroupBatch(expirable);
      await fetchData();
      toast({ title: "Group expired", description: `${expiredCount} estimate${expiredCount === 1 ? "" : "s"} from ${groupName} marked expired.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Group expire failed", description: message, variant: "destructive" });
    } finally {
      setBulkExpiringGroupKey(null);
    }
  }, [fetchData, resolveAttentionGroupEstimates, toast]);

  const queueEstimateGroup = useCallback(async (groupName: string, clientId: string | null, estimatesInGroup: EstimateRow[]) => {
    const resolvedEstimates = await resolveAttentionGroupEstimates(clientId, estimatesInGroup);
    const readyEstimates = resolvedEstimates.filter((estimate) => estimate.status === "ready_to_send");

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
      const queuedCount = await queueEstimateGroupBatch(readyEstimates);
      await fetchData();
      toast({ title: "Estimate group queued", description: `${queuedCount} estimate${queuedCount === 1 ? "" : "s"} from ${groupName} will send in the daily 3:00 PM Eastern batch.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Group queue failed", description: message, variant: "destructive" });
    } finally {
      setBulkQueueingGroupKey(null);
    }
  }, [fetchData, resolveAttentionGroupEstimates, toast]);

  const loadAttentionGroupDetails = useCallback(async (clientId: string | null, fallback: EstimateRow[]) => {
    if (!clientId) return;

    setLoadingAttentionClientId(clientId);
    try {
      const rows = await resolveAttentionGroupEstimates(clientId, fallback);
      setAttentionDetailByClientId((prev) => ({ ...prev, [clientId]: rows }));
    } finally {
      setLoadingAttentionClientId((current) => (current === clientId ? null : current));
    }
  }, [resolveAttentionGroupEstimates]);

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
      navigate(`/office/inbox?threadId=${threadId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast({ title: "Could not open thread", description: message, variant: "destructive" });
    }
  }, [navigate, toast]);

  const attentionGroupsForDisplay = useMemo(() => {
    let next = [...attentionGroups];

    if (statusFilter !== "all" && ACTIVE_ATTENTION_STATUS_SET.has(statusFilter)) {
      next = next.filter((group) => {
        if (statusFilter === "needs_office_review") return group.review_count > 0;
        if (statusFilter === "needs_revision") return group.revision_count > 0;
        if (statusFilter === "ready_to_send") return group.ready_count > 0;
        return true;
      });
    }

    if (minAgeDays > 0) {
      next = next.filter((group) => {
        const ageMs = Date.now() - Date.parse(group.latest_created_at ?? "");
        if (!Number.isFinite(ageMs)) return false;
        return ageMs >= minAgeDays * MS_PER_DAY;
      });
    }

    return next;
  }, [attentionGroups, minAgeDays, statusFilter]);

  const managementEstimates = useMemo(() => (
    filteredEstimates.filter((estimate) => !ACTIVE_ATTENTION_STATUS_SET.has(estimate.status))
  ), [filteredEstimates]);

  const managementPagination = usePaginatedList(managementEstimates);

  const managementGroups = useMemo(() => {
    const statusMap = new Map<string, Map<string, { groupName: string; estimates: EstimateRow[] }>>();

    managementPagination.items.forEach((estimate) => {
      const statusKey = estimate.status;
      const groupKey = `${estimate.status}:${estimate.client_id ?? "unknown"}`;
      const groupName = estimate.clients?.company?.trim()
        ? `${estimate.clients.company.trim()} · ${estimate.clients?.name?.trim() || "Unknown client"}`
        : estimate.clients?.name?.trim() || "Unknown client";

      if (!statusMap.has(statusKey)) statusMap.set(statusKey, new Map());
      const clientMap = statusMap.get(statusKey)!;
      if (!clientMap.has(groupKey)) clientMap.set(groupKey, {
        groupName,
        estimates: [],
      });
      clientMap.get(groupKey)!.estimates.push(estimate);
    });

    return MANAGEMENT_STATUS_ORDER
      .filter((status) => statusMap.has(status))
      .map((status) => ({
        status,
        label: STATUS_LABELS[status] ?? status,
        groups: Array.from(statusMap.get(status)!.values()).sort((a, b) => a.groupName.localeCompare(b.groupName)),
      }));
  }, [managementPagination.items]);

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
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Estimate Attention</h2>
          <p className="text-sm text-muted-foreground">Review grouped client estimate work first, then use supporting creation, send-queue, and history tools as needed.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">Needs attention</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{attentionEstimateCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">Needs office review, needs revision, and ready-to-send estimate work.</div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Account review groups</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{attentionGroupsForDisplay.length}</div>
            <div className="mt-1 text-xs text-muted-foreground">Grouped client/company queues currently needing office attention.</div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ready to queue</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">{readyAttentionCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">Reviewed estimates currently eligible for the end-of-day batch.</div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-sm font-medium">Supporting creation</h3>
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

      {estimateSendBatches.length > 0 ? (
        <section className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-medium">Send queue follow-through</h3>
              <p className="text-xs text-muted-foreground">Supporting visibility for backend batch send units queued or sent per client account</p>
            </div>
            <span className="text-xs text-muted-foreground">Live RPC-backed</span>
          </div>
          <div className="space-y-2">
            {estimateSendBatches.map((batch) => (
              <div key={batch.batch_id} className="rounded-md border bg-muted/10 px-3 py-2 text-xs flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-medium text-foreground">{batch.client_name ?? "Unknown client"}</p>
                  <p className="text-muted-foreground">
                    {batch.status} · {batch.estimate_count} estimate{batch.estimate_count === 1 ? "" : "s"} · ${batch.total_amount.toFixed(2)}
                  </p>
                  <p className="text-muted-foreground">
                    Scheduled {formatDateTime(batch.scheduled_for)}{batch.sent_at ? ` · Sent ${formatDateTime(batch.sent_at)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs">{batch.status}</Badge>
                  <span className="text-[11px] text-muted-foreground">{batch.estimate_ids.length} linked</span>
                  {batch.status === "queued" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => handleCancelBatch(batch)}
                      disabled={mutatingBatchId === batch.batch_id}
                    >
                      {mutatingBatchId === batch.batch_id ? "Working..." : "Cancel batch"}
                    </Button>
                  ) : null}
                  {batch.status === "failed" || batch.status === "cancelled" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => handleRequeueBatch(batch)}
                      disabled={mutatingBatchId === batch.batch_id}
                    >
                      {mutatingBatchId === batch.batch_id ? "Working..." : "Requeue batch"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {attentionGroupsForDisplay.length === 0 ? (
        <section className="rounded-lg border border-dashed bg-card/60 p-4 text-sm text-muted-foreground">
          No grouped estimate attention items match the current filters.
        </section>
      ) : (
        <section className="rounded-lg border bg-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-medium">Grouped review queue</h3>
              <p className="text-xs text-muted-foreground">One client/company card per active estimate account, with all current review work together.</p>
            </div>
            <span className="text-xs text-muted-foreground">Live RPC-backed</span>
          </div>
          <div className="space-y-4">
            {attentionGroupsForDisplay.map((group) => {
              const fallbackEstimates = estimates
                .filter((estimate) => estimate.client_id === group.client_id && ACTIVE_ATTENTION_STATUS_SET.has(estimate.status))
                .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
              const detailRows = attentionDetailByClientId[group.client_id] ?? fallbackEstimates;
              const isLoadingGroup = loadingAttentionClientId === group.client_id;
              const canSelectRug = detailRows.some((estimate) => !!estimate.rug_id);
              const missingLoadedRows = detailRows.length !== group.estimate_count;

              return (
                <div key={group.client_id} className="rounded-lg border bg-muted/10 overflow-hidden">
                  <div className="px-4 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{group.groupName}</p>
                          <p className="text-xs text-muted-foreground">
                            {group.estimate_count} active estimate{group.estimate_count === 1 ? "" : "s"} · ${group.total_amount.toFixed(2)}
                            {group.latest_created_at ? ` · latest ${formatDateTime(group.latest_created_at)}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span>{group.review_count} need review</span>
                          <span>•</span>
                          <span>{group.revision_count} need revision</span>
                          <span>•</span>
                          <span>{group.ready_count} ready to queue</span>
                        </div>
                        {group.rug_tags.length > 0 ? (
                          <p className="text-[11px] text-muted-foreground">Rugs: {group.rug_tags.join(", ")}</p>
                        ) : null}
                        {missingLoadedRows ? (
                          <p className="text-[11px] text-amber-600">Showing {detailRows.length} of {group.estimate_count} active estimate rows locally. Refresh details for the backend-complete group.</p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => {
                            const matchingEstimate = detailRows.find((estimate) => !!estimate.rug_id);
                            if (matchingEstimate?.rug_id) {
                              setSelectedRugId(matchingEstimate.rug_id);
                            }
                          }}
                          disabled={!canSelectRug}
                        >
                          Select group rug
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => loadAttentionGroupDetails(group.client_id, fallbackEstimates)}
                          disabled={isLoadingGroup}
                        >
                          {isLoadingGroup ? "Refreshing..." : detailRows.length === 0 ? "Load group details" : "Refresh details"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => moveGroupToReady(group.groupName, group.client_id, detailRows)}
                          disabled={bulkReviewingGroupKey === group.groupName || group.review_count === 0}
                        >
                          {bulkReviewingGroupKey === group.groupName ? "Updating..." : "Mark review group ready"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => queueEstimateGroup(group.groupName, group.client_id, detailRows)}
                          disabled={bulkQueueingGroupKey === group.groupName || group.ready_count === 0}
                        >
                          {bulkQueueingGroupKey === group.groupName ? "Queueing..." : "Queue ready group"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleExpireEstimateGroup(group.groupName, group.client_id, detailRows)}
                          disabled={bulkExpiringGroupKey === group.groupName || group.estimate_count === 0}
                        >
                          {bulkExpiringGroupKey === group.groupName ? "Expiring..." : "Expire active group"}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <Separator />
                  {detailRows.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-muted-foreground">No active estimate rows are currently loaded for this group.</div>
                  ) : (
                    <div className="divide-y">
                      {detailRows.map((estimate) => (
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
                            {estimate.status === "needs_revision" && (
                              <Button size="sm" variant="default" className="h-7 text-xs" onClick={() => setEstimateStatus(estimate, "needs_office_review")}>
                                Return to office review
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEstimateStatus(estimate, "expired")}>
                              Mark expired
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">Management and history (transitional)</h3>
          <p className="text-xs text-muted-foreground">Broader estimate history remains here temporarily until a dedicated management surface is split out.</p>
        </div>
      </section>

      {managementGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No management/history estimates match the current filter.</p>
      ) : (
        managementGroups.map(({ status, label, groups }) => (
          <section key={status} className="border rounded-lg bg-card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <h3 className="font-medium text-sm">{label}</h3>
              <Badge variant="secondary" className="text-xs">{groups.reduce((sum, group) => sum + group.estimates.length, 0)}</Badge>
            </div>
            <Separator />
            <div>
              {groups.map((group, groupIndex) => (
                <div key={`${status}-${group.groupName}`} className={groupIndex > 0 ? "border-t" : ""}>
                  <div className="px-4 py-3 bg-muted/20">
                    <p className="text-sm font-medium text-foreground">{group.groupName}</p>
                    <p className="text-xs text-muted-foreground">{group.estimates.length} estimate{group.estimates.length === 1 ? "" : "s"}</p>
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
        page={managementPagination.page}
        totalPages={managementPagination.totalPages}
        total={managementPagination.total}
        hasPrev={managementPagination.hasPrev}
        hasNext={managementPagination.hasNext}
        onPrev={managementPagination.prevPage}
        onNext={managementPagination.nextPage}
        label="management estimates"
      />
    </div>
  );
}
