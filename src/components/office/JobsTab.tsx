import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { LoadingState } from "@/components/states/PageState";
import { InvoiceStatusBadge, PickupStatusBadge, RugStatusBadge } from "@/components/shared/StatusBadge";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";

type PickupRequestRow = Pick<
  ExtendedTableRow<"pickup_requests">,
  "id" | "client_id" | "route_day" | "scheduled_date" | "status" | "notes" | "updated_at"
> & {
  clients?: { name: string; address: string | null } | null;
};

type PickupItemRow = Pick<
  ExtendedTableRow<"pickup_request_items">,
  | "id"
  | "pickup_request_id"
  | "rug_number"
  | "rug_type"
  | "length"
  | "width"
  | "verified"
  | "checked_in_rug_id"
  | "estimate_requested"
  | "estimate_request_details"
>;

type RugLookup = {
  id: string;
  client_id: string | null;
  tag: string;
  description: string;
  status: string;
  photo_url: string | null;
  size_length: number | null;
  size_width: number | null;
  checked_in_at: string | null;
  completed_at: string | null;
  intake_date: string | null;
  intake_source: string | null;
};

type RugServiceLookup = {
  rug_id: string;
  service_name: string | null;
  line_total: number | null;
};

type EstimateResponseLookup = {
  rug_id: string | null;
  event_type: string;
  subject: string | null;
  created_at: string;
};

type InvoiceLookup = {
  id: string;
  invoice_number: string;
  status: string;
  created_at: string;
  issued_at: string | null;
};

type ReturnEventLookup = {
  rug_id: string | null;
  event_type: string;
  created_at: string;
};

const RETURN_EVENT_TYPES = ["rug_immediate_return_logged", "rug_reentry_logged", "rug_return_resolved"] as const;

type LatestReturnState = {
  kind: "immediate_return" | "reentry";
  state: "open" | "resolved";
  createdAt: string;
};

type InvoiceItemLookup = {
  rug_id: string | null;
  invoices: InvoiceLookup | InvoiceLookup[] | null;
};

type LatestEstimateResponse = {
  status: "approved" | "rejected";
  subject: string | null;
  createdAt: string;
};

type JobItemView = PickupItemRow & {
  linkedRug: RugLookup | null;
  linkedServices: string[];
  linkedServiceTotal: number;
  latestEstimateResponse: LatestEstimateResponse | null;
  linkedInvoice: InvoiceLookup | null;
  latestReturnState: LatestReturnState | null;
  itemSource?: string | null;
};

type JobFilter = "all" | "estimate_open" | "uninvoiced" | "delivered" | "returns" | "attention";

type JobView = {
  key: string;
  clientId: string;
  clientName: string;
  clientAddress: string | null;
  scheduledDate: string;
  routeDay: string;
  requestIds: string[];
  primaryRequestId: string;
  statuses: ExtendedTableRow<"pickup_requests">["status"][];
  updatedAt: string;
  notes: string[];
  items: JobItemView[];
};

type ItemEditorState = {
  mode: "create" | "edit";
  pickupRequestId: string;
  itemId: string | null;
  linkedRugId: string | null;
  rugNumber: string;
  rugType: string;
  length: string;
  width: string;
  estimateRequested: boolean;
  estimateDetails: string;
};

type JobNoteEditorState = {
  jobKey: string;
  clientName: string;
  scheduledDate: string;
  requestIds: string[];
  notes: string;
};

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatSize(length: number | null, width: number | null) {
  if (length == null && width == null) return "—";
  if (length != null && width != null) return `${length} × ${width}`;
  if (length != null) return `${length} L`;
  return `${width} W`;
}

function latestIso(values: string[]) {
  return values.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? new Date(0).toISOString();
}

export function JobsTab({ onOpenRug }: { onOpenRug: (rugId: string) => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [search, setSearch] = useState("");
  const [routeDayFilter, setRouteDayFilter] = useState<string>("all");
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [jobFilters, setJobFilters] = useState<Record<string, JobFilter>>({});
  const [editor, setEditor] = useState<ItemEditorState | null>(null);
  const [noteEditor, setNoteEditor] = useState<JobNoteEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: requestData, error: requestError } = await supabaseExtended
        .from("pickup_requests")
        .select("id, client_id, route_day, scheduled_date, status, notes, updated_at, clients(name, address)")
        .order("scheduled_date", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(500);

      if (requestError) throw requestError;

      const requests = (requestData ?? []) as unknown as PickupRequestRow[];
      const requestIds = requests.map((request) => request.id);

      const itemResult = requestIds.length > 0
        ? await supabaseExtended
            .from("pickup_request_items")
            .select("id, pickup_request_id, rug_number, rug_type, length, width, verified, checked_in_rug_id, estimate_requested, estimate_request_details")
            .in("pickup_request_id", requestIds)
        : null;

      if (itemResult?.error) throw itemResult.error;

      const items = requestIds.length > 0
        ? ((itemResult?.data ?? []) as PickupItemRow[])
        : [];

      const checkedInRugIds = items
        .map((item) => item.checked_in_rug_id)
        .filter((value): value is string => Boolean(value));

      const { data: rugInventoryData, error: rugInventoryError } = await supabase
        .from("rugs")
        .select("id, client_id, tag, description, status, photo_url, size_length, size_width, checked_in_at, completed_at, intake_date, intake_source")
        .order("checked_in_at", { ascending: false })
        .limit(500);

      if (rugInventoryError) throw rugInventoryError;

      const rugInventory = (rugInventoryData ?? []) as RugLookup[];
      const allRelevantRugIds = Array.from(new Set([...checkedInRugIds, ...rugInventory.map((rug) => rug.id)]));

      let rugMap = new Map<string, RugLookup>();
      const serviceMap = new Map<string, string[]>();
      const serviceTotalMap = new Map<string, number>();
      const estimateResponseMap = new Map<string, LatestEstimateResponse>();
      const invoiceMap = new Map<string, InvoiceLookup>();
      const returnEventMap = new Map<string, LatestReturnState>();

      if (allRelevantRugIds.length > 0) {
        const [rugResult, serviceResult, responseResult, invoiceResult, returnResult] = await Promise.all([
          supabase
            .from("rugs")
            .select("id, client_id, tag, description, status, photo_url, size_length, size_width, checked_in_at, completed_at, intake_date, intake_source")
            .in("id", allRelevantRugIds),
          supabase
            .from("rug_services")
            .select("rug_id, service_name, line_total")
            .in("rug_id", allRelevantRugIds),
          supabaseExtended
            .from("communication_events")
            .select("rug_id, event_type, subject, created_at")
            .in("rug_id", allRelevantRugIds)
            .in("event_type", ["estimate_approved_by_client", "estimate_rejected_by_client"])
            .order("created_at", { ascending: false }),
          supabase
            .from("invoice_items")
            .select("rug_id, invoices(id, invoice_number, status, created_at, issued_at)")
            .in("rug_id", allRelevantRugIds),
          supabaseExtended
            .from("communication_events")
            .select("rug_id, event_type, created_at")
            .in("rug_id", allRelevantRugIds)
            .in("event_type", [...RETURN_EVENT_TYPES])
            .order("created_at", { ascending: false }),
        ]);

        if (rugResult.error) throw rugResult.error;
        if (serviceResult.error) throw serviceResult.error;
        if (responseResult.error) throw responseResult.error;
        if (invoiceResult.error) throw invoiceResult.error;
        if (returnResult.error) throw returnResult.error;

        rugMap = new Map(((rugResult.data ?? []) as RugLookup[]).map((rug) => [rug.id, rug]));

        for (const row of (serviceResult.data ?? []) as RugServiceLookup[]) {
          const current = serviceMap.get(row.rug_id) ?? [];
          const name = row.service_name?.trim();
          if (name && !current.includes(name)) current.push(name);
          serviceMap.set(row.rug_id, current);
          serviceTotalMap.set(row.rug_id, (serviceTotalMap.get(row.rug_id) ?? 0) + Number(row.line_total ?? 0));
        }

        for (const row of (responseResult.data ?? []) as EstimateResponseLookup[]) {
          if (!row.rug_id || estimateResponseMap.has(row.rug_id)) continue;
          estimateResponseMap.set(row.rug_id, {
            status: row.event_type === "estimate_approved_by_client" ? "approved" : "rejected",
            subject: row.subject,
            createdAt: row.created_at,
          });
        }

        for (const row of (invoiceResult.data ?? []) as InvoiceItemLookup[]) {
          if (!row.rug_id || invoiceMap.has(row.rug_id) || !row.invoices) continue;
          const invoice = Array.isArray(row.invoices) ? row.invoices[0] ?? null : row.invoices;
          if (!invoice) continue;
          invoiceMap.set(row.rug_id, invoice);
        }

        const groupedReturnEvents = new Map<string, ReturnEventLookup[]>();
        for (const row of (returnResult.data ?? []) as ReturnEventLookup[]) {
          if (!row.rug_id) continue;
          const existing = groupedReturnEvents.get(row.rug_id) ?? [];
          existing.push(row);
          groupedReturnEvents.set(row.rug_id, existing);
        }

        for (const [rugId, events] of groupedReturnEvents.entries()) {
          const latest = events[0];
          const activeEvent = events.find((event) => event.event_type !== "rug_return_resolved") ?? latest;
          if (!latest || !activeEvent) continue;
          returnEventMap.set(rugId, {
            kind: activeEvent.event_type === "rug_immediate_return_logged" ? "immediate_return" : "reentry",
            state: latest.event_type === "rug_return_resolved" ? "resolved" : "open",
            createdAt: activeEvent.created_at,
          });
        }
      }

      const requestById = new Map(requests.map((request) => [request.id, request]));
      const clientInfoById = new Map<string, { name: string; address: string | null }>();
      for (const request of requests) {
        clientInfoById.set(request.client_id, {
          name: request.clients?.name ?? "Unknown client",
          address: request.clients?.address ?? null,
        });
      }

      const missingClientIds = Array.from(new Set(
        rugInventory
          .map((rug) => rug.client_id)
          .filter((value): value is string => Boolean(value) && !clientInfoById.has(value))
      ));

      if (missingClientIds.length > 0) {
        const { data: missingClients } = await supabase
          .from("clients")
          .select("id, name, address")
          .in("id", missingClientIds);
        for (const client of missingClients ?? []) {
          clientInfoById.set(client.id, { name: client.name, address: client.address });
        }
      }

      const grouped = new Map<string, JobView>();
      const upsertJob = (input: {
        key: string;
        clientId: string;
        clientName: string;
        clientAddress: string | null;
        scheduledDate: string;
        routeDay: string;
        requestId?: string;
        status?: ExtendedTableRow<"pickup_requests">["status"];
        updatedAt: string;
        note?: string | null;
      }) => {
        const existing = grouped.get(input.key);
        if (existing) {
          if (input.requestId && !existing.requestIds.includes(input.requestId)) {
            existing.requestIds.push(input.requestId);
          }
          if (input.requestId && !existing.primaryRequestId) {
            existing.primaryRequestId = input.requestId;
          }
          if (input.status && !existing.statuses.includes(input.status)) {
            existing.statuses.push(input.status);
          }
          if (input.note?.trim()) {
            existing.notes.push(input.note.trim());
          }
          existing.updatedAt = latestIso([existing.updatedAt, input.updatedAt]);
          return existing;
        }

        const created: JobView = {
          key: input.key,
          clientId: input.clientId,
          clientName: input.clientName,
          clientAddress: input.clientAddress,
          scheduledDate: input.scheduledDate,
          routeDay: input.routeDay,
          requestIds: input.requestId ? [input.requestId] : [],
          primaryRequestId: input.requestId ?? "",
          statuses: input.status ? [input.status] : [],
          updatedAt: input.updatedAt,
          notes: input.note?.trim() ? [input.note.trim()] : [],
          items: [],
        };
        grouped.set(input.key, created);
        return created;
      };

      for (const item of items) {
        const request = requestById.get(item.pickup_request_id);
        if (!request) continue;
        const linkedRug = item.checked_in_rug_id ? rugMap.get(item.checked_in_rug_id) ?? null : null;
        const linkedServices = item.checked_in_rug_id ? serviceMap.get(item.checked_in_rug_id) ?? [] : [];
        const linkedServiceTotal = item.checked_in_rug_id ? serviceTotalMap.get(item.checked_in_rug_id) ?? 0 : 0;
        const latestEstimateResponse = item.checked_in_rug_id ? estimateResponseMap.get(item.checked_in_rug_id) ?? null : null;
        const linkedInvoice = item.checked_in_rug_id ? invoiceMap.get(item.checked_in_rug_id) ?? null : null;
        const latestReturnState = item.checked_in_rug_id ? returnEventMap.get(item.checked_in_rug_id) ?? null : null;
        const eventDate = linkedRug?.intake_date?.slice(0, 10) ?? linkedRug?.checked_in_at?.slice(0, 10) ?? request.scheduled_date;
        const sourceLabel = linkedRug?.intake_source === "pickup" ? "Pickup" : linkedRug?.intake_source ? "Walk-in" : request.route_day || "Unassigned";
        const key = `${request.client_id}__${eventDate}`;
        const job = upsertJob({
          key,
          clientId: request.client_id,
          clientName: request.clients?.name ?? clientInfoById.get(request.client_id)?.name ?? "Unknown client",
          clientAddress: request.clients?.address ?? clientInfoById.get(request.client_id)?.address ?? null,
          scheduledDate: eventDate,
          routeDay: sourceLabel,
          requestId: request.id,
          status: request.status,
          updatedAt: linkedRug?.checked_in_at ?? request.updated_at,
          note: request.notes,
        });
        job.items.push({ ...item, linkedRug, linkedServices, linkedServiceTotal, latestEstimateResponse, linkedInvoice, latestReturnState, itemSource: linkedRug?.intake_source ?? "pickup" });
      }

      const representedRugIds = new Set(items.map((item) => item.checked_in_rug_id).filter((value): value is string => Boolean(value)));
      for (const rug of rugInventory) {
        if (!rug.client_id || representedRugIds.has(rug.id)) continue;
        const eventDate = rug.intake_date?.slice(0, 10) ?? rug.checked_in_at?.slice(0, 10);
        if (!eventDate) continue;
        const clientInfo = clientInfoById.get(rug.client_id);
        const key = `${rug.client_id}__${eventDate}`;
        const job = upsertJob({
          key,
          clientId: rug.client_id,
          clientName: clientInfo?.name ?? "Unknown client",
          clientAddress: clientInfo?.address ?? null,
          scheduledDate: eventDate,
          routeDay: rug.intake_source === "pickup" ? "Pickup" : "Walk-in",
          updatedAt: rug.checked_in_at ?? rug.completed_at ?? new Date(0).toISOString(),
        });
        job.items.push({
          id: `rug:${rug.id}`,
          pickup_request_id: "",
          rug_number: rug.tag,
          rug_type: rug.description,
          length: rug.size_length,
          width: rug.size_width,
          verified: true,
          checked_in_rug_id: rug.id,
          estimate_requested: false,
          estimate_request_details: null,
          linkedRug: rug,
          linkedServices: serviceMap.get(rug.id) ?? [],
          linkedServiceTotal: serviceTotalMap.get(rug.id) ?? 0,
          latestEstimateResponse: estimateResponseMap.get(rug.id) ?? null,
          linkedInvoice: invoiceMap.get(rug.id) ?? null,
          latestReturnState: returnEventMap.get(rug.id) ?? null,
          itemSource: rug.intake_source,
        });
      }

      const nextJobs = Array.from(grouped.values())
        .filter((job) => job.items.length > 0)
        .map((job) => ({
          ...job,
          notes: Array.from(new Set(job.notes.filter(Boolean))),
          items: [...job.items].sort((a, b) =>
            a.rug_number.localeCompare(b.rug_number, undefined, { numeric: true, sensitivity: "base" }),
          ),
        }))
        .sort((a, b) => Date.parse(`${b.scheduledDate}T12:00:00`) - Date.parse(`${a.scheduledDate}T12:00:00`));

      setJobs(nextJobs);
      setExpandedJobs((prev) => {
        const next: Record<string, boolean> = {};
        for (const job of nextJobs) {
          next[job.key] = prev[job.key] ?? nextJobs.length <= 8;
        }
        return next;
      });
    } catch (error) {
      toast({
        title: "Failed to load jobs",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (routeDayFilter !== "all" && job.routeDay !== routeDayFilter) return false;
      if (!query) return true;
      const haystacks = [job.clientName.toLowerCase(), job.scheduledDate.toLowerCase(), job.routeDay.toLowerCase()];
      if (haystacks.some((value) => value.includes(query))) return true;
      return job.items.some((item) => {
        const rugValues = [item.rug_number, item.rug_type ?? "", item.linkedRug?.tag ?? "", ...(item.linkedServices ?? [])];
        return rugValues.some((value) => value.toLowerCase().includes(query));
      });
    });
  }, [jobs, routeDayFilter, search]);

  const sourceOptions = useMemo(
    () => Array.from(new Set(jobs.map((job) => job.routeDay).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [jobs],
  );

  const pagination = usePaginatedList(filteredJobs);

  const openJobNoteDialog = (job: JobView) => {
    setNoteEditor({
      jobKey: job.key,
      clientName: job.clientName,
      scheduledDate: job.scheduledDate,
      requestIds: job.requestIds,
      notes: job.notes.join("\n\n"),
    });
  };

  const openCreateDialog = (job: JobView) => {
    setEditor({
      mode: "create",
      pickupRequestId: job.primaryRequestId,
      itemId: null,
      linkedRugId: null,
      rugNumber: "",
      rugType: "",
      length: "",
      width: "",
      estimateRequested: false,
      estimateDetails: "",
    });
  };

  const openEditDialog = (item: JobItemView) => {
    setEditor({
      mode: "edit",
      pickupRequestId: item.pickup_request_id,
      itemId: item.id,
      linkedRugId: item.checked_in_rug_id,
      rugNumber: item.rug_number,
      rugType: item.rug_type ?? "",
      length: item.length != null ? String(item.length) : "",
      width: item.width != null ? String(item.width) : "",
      estimateRequested: Boolean(item.estimate_requested),
      estimateDetails: item.estimate_request_details ?? "",
    });
  };

  const closeEditor = () => {
    if (!saving) setEditor(null);
  };

  const closeNoteEditor = () => {
    if (!savingNotes) setNoteEditor(null);
  };

  const saveEditor = async () => {
    if (!editor) return;
    const rugNumber = editor.rugNumber.trim();
    if (!rugNumber) {
      toast({ title: "Rug number required", variant: "destructive" });
      return;
    }

    const length = editor.length.trim() ? Number(editor.length) : null;
    const width = editor.width.trim() ? Number(editor.width) : null;
    if ((length != null && Number.isNaN(length)) || (width != null && Number.isNaN(width))) {
      toast({ title: "Invalid dimensions", description: "Length and width must be numeric.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        pickup_request_id: editor.pickupRequestId,
        rug_number: rugNumber,
        rug_type: editor.rugType.trim(),
        length,
        width,
        estimate_requested: editor.estimateRequested,
        estimate_request_details: editor.estimateRequested ? editor.estimateDetails.trim() || null : null,
      };

      if (editor.mode === "create") {
        const { error } = await supabaseExtended.from("pickup_request_items").insert(payload);
        if (error) throw error;
      } else if (editor.itemId) {
        const { error } = await supabaseExtended.from("pickup_request_items").update(payload).eq("id", editor.itemId);
        if (error) throw error;

        if (editor.linkedRugId) {
          const { error: rugError } = await supabase
            .from("rugs")
            .update({
              tag: rugNumber,
              description: editor.rugType.trim(),
              size_length: length,
              size_width: width,
            })
            .eq("id", editor.linkedRugId);
          if (rugError) throw rugError;
        }
      }

      toast({ title: editor.mode === "create" ? "Pickup item added" : "Pickup item updated" });
      setEditor(null);
      await loadJobs();
    } catch (error) {
      toast({
        title: editor.mode === "create" ? "Add failed" : "Save failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const saveJobNotes = async () => {
    if (!noteEditor) return;
    setSavingNotes(true);
    const notes = noteEditor.notes.trim();
    const { error } = await supabaseExtended
      .from("pickup_requests")
      .update({ notes: notes || null })
      .in("id", noteEditor.requestIds);

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      setSavingNotes(false);
      return;
    }

    toast({ title: "Batch notes updated" });
    setNoteEditor(null);
    await loadJobs();
    setSavingNotes(false);
  };

  const removeItem = async (item: JobItemView) => {
    if (item.checked_in_rug_id) {
      toast({
        title: "Remove blocked",
        description: "This rug is already checked in. Open the rug detail instead of deleting the pickup item.",
        variant: "destructive",
      });
      return;
    }

    if (!window.confirm(`Remove rug ${item.rug_number} from this job?`)) return;

    const { error } = await supabaseExtended.from("pickup_request_items").delete().eq("id", item.id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Pickup item removed" });
    await loadJobs();
  };

  if (loading) {
    return (
      <div className="app-page flex h-full items-center justify-center">
        <LoadingState title="Loading jobs" description="Grouping rugs by day entered or received..." />
      </div>
    );
  }

  return (
    <div className="app-page h-full overflow-auto space-y-5 animate-fade-in-up">
      <section className="app-section">
        <div className="app-section-header gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Jobs</h2>
            <p className="text-sm text-muted-foreground">Client rug history grouped by day entered or received.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search client or rug number…"
                className="pl-9"
              />
            </div>
            <Select value={routeDayFilter} onValueChange={setRouteDayFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sourceOptions.map((source) => (
                  <SelectItem key={source} value={source}>{source}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {filteredJobs.length === 0 ? (
        <div className="app-section rounded-2xl border border-dashed border-border/70 bg-card/70 p-8 text-center text-muted-foreground">
          No jobs match the current filters.
        </div>
      ) : (
        pagination.items.map((job) => {
          const expanded = expandedJobs[job.key] ?? true;
          const activeJobFilter = jobFilters[job.key] ?? "all";
          const checkedInCount = job.items.filter((item) => item.checked_in_rug_id).length;
          const estimateCount = job.items.filter((item) => item.estimate_requested).length;
          const verifiedCount = job.items.filter((item) => item.verified).length;
          const statusSet = [...job.statuses].sort();
          const invoicedCount = job.items.filter((item) => item.linkedInvoice).length;
          const estimateRespondedCount = job.items.filter((item) => item.latestEstimateResponse).length;
          const approvedEstimateCount = job.items.filter((item) => item.latestEstimateResponse?.status === "approved").length;
          const rejectedEstimateCount = job.items.filter((item) => item.latestEstimateResponse?.status === "rejected").length;
          const openEstimateCount = Math.max(estimateCount - estimateRespondedCount, 0);
          const deliveredCount = job.items.filter((item) => item.linkedRug?.status === "delivered").length;
          const uninvoicedCount = job.items.filter((item) => !item.linkedInvoice).length;
          const returnCount = job.items.filter((item) => item.latestReturnState?.state === "open").length;
          const attentionCount = job.items.filter((item) => item.latestReturnState?.state === "open" || (item.estimate_requested && !item.latestEstimateResponse) || (!item.linkedInvoice && item.linkedRug?.status === "ready")).length;
          const billedTotal = job.items.reduce((sum, item) => sum + (item.linkedInvoice ? Number(item.linkedServiceTotal || 0) : 0), 0);
          const serviceTotal = job.items.reduce((sum, item) => sum + Number(item.linkedServiceTotal || 0), 0);
          const visibleItems = job.items.filter((item) => {
            if (activeJobFilter === "estimate_open") return item.estimate_requested && !item.latestEstimateResponse;
            if (activeJobFilter === "uninvoiced") return !item.linkedInvoice;
            if (activeJobFilter === "delivered") return item.linkedRug?.status === "delivered";
            if (activeJobFilter === "returns") return item.latestReturnState?.state === "open";
            if (activeJobFilter === "attention") return item.latestReturnState?.state === "open" || (item.estimate_requested && !item.latestEstimateResponse) || (!item.linkedInvoice && item.linkedRug?.status === "ready");
            return true;
          });
          const latestActivityAt = [
            job.updatedAt,
            ...job.items.flatMap((item) => [
              item.linkedRug?.checked_in_at,
              item.linkedRug?.completed_at,
              item.latestEstimateResponse?.createdAt,
              item.linkedInvoice?.issued_at,
              item.linkedInvoice?.created_at,
            ].filter(Boolean) as string[]),
          ].sort((a, b) => Date.parse(b) - Date.parse(a))[0];
          const activityEvents = [
            { at: `${job.scheduledDate}T12:00:00`, label: `Pickup requested for ${formatDate(job.scheduledDate)}` },
            ...job.items.flatMap((item) => {
              const events: Array<{ at: string; label: string }> = [];
              if (item.linkedRug?.checked_in_at) {
                events.push({ at: item.linkedRug.checked_in_at, label: `${item.rug_number} checked in` });
              }
              if (item.latestEstimateResponse) {
                events.push({
                  at: item.latestEstimateResponse.createdAt,
                  label: `${item.rug_number} estimate ${item.latestEstimateResponse.status}`,
                });
              }
              if (item.linkedInvoice) {
                events.push({
                  at: item.linkedInvoice.issued_at ?? item.linkedInvoice.created_at,
                  label: `${item.linkedInvoice.invoice_number} linked for ${item.rug_number}`,
                });
              }
              if (item.linkedRug?.status === "delivered") {
                events.push({
                  at: item.linkedInvoice?.issued_at ?? item.linkedInvoice?.created_at ?? job.updatedAt,
                  label: `${item.rug_number} delivered`,
                });
              }
              return events;
            }),
          ]
            .filter((event) => Boolean(event.at))
            .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
            .slice(0, 6);

          return (
            <section key={job.key} className="overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-sm">
              <button
                type="button"
                onClick={() => setExpandedJobs((prev) => ({ ...prev, [job.key]: !prev[job.key] }))}
                className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left transition-colors hover:bg-muted/30"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {expanded ? <ChevronDown className="mt-0.5 h-4 w-4 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 text-muted-foreground" />}
                    <div>
                      <h3 className="text-base font-semibold text-foreground">{job.clientName}</h3>
                      <p className="text-sm text-muted-foreground">{formatDate(job.scheduledDate)} · {job.routeDay}</p>
                    </div>
                  </div>
                  <p className="pl-6 text-xs text-muted-foreground">{job.items.length} rug{job.items.length === 1 ? "" : "s"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 pt-1">
                  {job.primaryRequestId ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={(event) => {
                          event.stopPropagation();
                          openJobNoteDialog(job);
                        }}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Notes
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={(event) => {
                          event.stopPropagation();
                          openCreateDialog(job);
                        }}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add rug
                      </Button>
                    </>
                  ) : null}
                </div>
              </button>

              {expanded ? (
                <div className="space-y-4 border-t border-border/70 px-4 py-4">
                  {job.notes.length > 0 ? (
                    <div className="rounded-xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{job.notes.join(" · ")}</div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: "all", label: `All (${job.items.length})` },
                      { id: "estimate_open", label: `Estimate pending (${openEstimateCount})` },
                      { id: "uninvoiced", label: `Uninvoiced (${uninvoicedCount})` },
                      { id: "delivered", label: `Delivered (${deliveredCount})` },
                      { id: "returns", label: `Returns / re-entry (${returnCount})` },
                      { id: "attention", label: `Needs attention (${attentionCount})` },
                    ].map((filter) => (
                      <Button
                        key={filter.id}
                        type="button"
                        size="sm"
                        variant={activeJobFilter === filter.id ? "default" : "outline"}
                        className="h-8"
                        onClick={() => setJobFilters((prev) => ({ ...prev, [job.key]: filter.id as JobFilter }))}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {visibleItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/70 bg-background/50 p-6 text-center text-sm text-muted-foreground">
                        No rugs match the current job filter.
                      </div>
                    ) : visibleItems.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-foreground">{item.rug_number}</span>
                              {item.checked_in_rug_id ? <Badge variant="secondary">Linked rug</Badge> : <Badge variant="outline">Pre-check-in</Badge>}
                              {item.verified ? <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Truck confirmed</Badge> : null}
                              {item.estimate_requested ? <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Estimate requested</Badge> : null}
                              {item.linkedRug ? <RugStatusBadge status={item.linkedRug.status} /> : null}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              <span>{item.rug_type || "Type not set"}</span>
                              <span className="mx-2">•</span>
                              <span>{formatSize(item.length, item.width)}</span>
                            </div>
                            {item.estimate_request_details ? <p className="text-sm text-muted-foreground">Estimate note: {item.estimate_request_details}</p> : null}
                            {item.latestEstimateResponse ? (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <Badge className={item.latestEstimateResponse.status === "approved" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"}>
                                  Estimate {item.latestEstimateResponse.status}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{new Date(item.latestEstimateResponse.createdAt).toLocaleDateString()}</span>
                              </div>
                            ) : null}
                            {item.linkedInvoice ? (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <Badge variant="outline">{item.linkedInvoice.invoice_number}</Badge>
                                <InvoiceStatusBadge status={item.linkedInvoice.status} />
                              </div>
                            ) : null}
                            {item.latestReturnState ? (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <Badge className={item.latestReturnState.kind === "immediate_return" ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200"}>
                                  {item.latestReturnState.kind === "immediate_return" ? "Immediate return" : "Re-entry"}
                                </Badge>
                                <Badge variant="outline">{item.latestReturnState.state === "open" ? "Open" : "Resolved"}</Badge>
                              </div>
                            ) : null}
                            {item.linkedServices.length > 0 ? (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {item.linkedServices.map((service) => (
                                  <Badge key={`${item.id}-${service}`} variant="secondary">{service}</Badge>
                                ))}
                                {item.linkedServiceTotal > 0 ? <Badge variant="outline">${item.linkedServiceTotal.toFixed(2)} services</Badge> : null}
                              </div>
                            ) : item.linkedServiceTotal > 0 ? (
                              <div className="flex flex-wrap gap-2 pt-1">
                                <Badge variant="outline">${item.linkedServiceTotal.toFixed(2)} services</Badge>
                              </div>
                            ) : null}
                          </div>

                          <div className="flex items-start gap-3">
                            {item.linkedRug?.photo_url ? (
                              <img
                                src={item.linkedRug.photo_url}
                                alt={`Rug ${item.rug_number}`}
                                className="h-20 w-20 rounded-xl border object-cover"
                              />
                            ) : null}
                            <div className="flex flex-wrap justify-end gap-2">
                              {item.checked_in_rug_id ? (
                                <Button size="sm" variant="outline" onClick={() => onOpenRug(item.checked_in_rug_id!)}>
                                  Open rug
                                </Button>
                              ) : null}
                              {item.pickup_request_id ? (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => openEditDialog(item)}>
                                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                                  </Button>
                                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void removeItem(item)}>
                                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                                  </Button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          );
        })
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        hasPrev={pagination.hasPrev}
        hasNext={pagination.hasNext}
        onPrev={pagination.prevPage}
        onNext={pagination.nextPage}
        label="jobs"
      />

      <Dialog open={Boolean(noteEditor)} onOpenChange={(open) => { if (!open) closeNoteEditor(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch notes</DialogTitle>
            <DialogDescription>
              Save office notes for this client + pickup-date job so the whole batch carries the same context.
            </DialogDescription>
          </DialogHeader>

          {noteEditor ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
                <div className="font-medium text-foreground">{noteEditor.clientName}</div>
                <div className="mt-1 text-muted-foreground">Job {formatDate(noteEditor.scheduledDate)}</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="job-batch-notes">Batch notes</Label>
                <Textarea
                  id="job-batch-notes"
                  value={noteEditor.notes}
                  onChange={(event) => setNoteEditor((current) => current ? { ...current, notes: event.target.value } : current)}
                  rows={8}
                  placeholder="Office notes, call notes, pickup context, follow-up instructions..."
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={closeNoteEditor} disabled={savingNotes}>Cancel</Button>
            <Button onClick={() => void saveJobNotes()} disabled={savingNotes}>{savingNotes ? "Saving..." : "Save notes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open) closeEditor(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor?.mode === "create" ? "Add rug to job" : "Edit job rug"}</DialogTitle>
            <DialogDescription>
              Update the client + pickup-date job record. If the rug has already been checked in, the linked rug profile will be updated too.
            </DialogDescription>
          </DialogHeader>

          {editor ? (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="job-rug-number">Rug number</Label>
                <Input id="job-rug-number" value={editor.rugNumber} onChange={(event) => setEditor((current) => current ? { ...current, rugNumber: event.target.value } : current)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="job-rug-type">Rug type</Label>
                <Input id="job-rug-type" value={editor.rugType} onChange={(event) => setEditor((current) => current ? { ...current, rugType: event.target.value } : current)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job-rug-length">Length</Label>
                  <Input id="job-rug-length" inputMode="decimal" value={editor.length} onChange={(event) => setEditor((current) => current ? { ...current, length: event.target.value } : current)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="job-rug-width">Width</Label>
                  <Input id="job-rug-width" inputMode="decimal" value={editor.width} onChange={(event) => setEditor((current) => current ? { ...current, width: event.target.value } : current)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="job-estimate-requested">Estimate requested</Label>
                <Select value={editor.estimateRequested ? "yes" : "no"} onValueChange={(value) => setEditor((current) => current ? { ...current, estimateRequested: value === "yes" } : current)}>
                  <SelectTrigger id="job-estimate-requested">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="job-estimate-details">Estimate details</Label>
                <Textarea
                  id="job-estimate-details"
                  value={editor.estimateDetails}
                  onChange={(event) => setEditor((current) => current ? { ...current, estimateDetails: event.target.value } : current)}
                  rows={4}
                  placeholder="Describe the requested estimate or special handling"
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={closeEditor} disabled={saving}>Cancel</Button>
            <Button onClick={() => void saveEditor()} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
