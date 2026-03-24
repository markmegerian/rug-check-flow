import { useCallback, useEffect, useMemo, useState } from "react";
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
import { PickupStatusBadge, RugStatusBadge } from "@/components/shared/StatusBadge";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";
import { DAYS_OF_WEEK } from "@/lib/constants";

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
  tag: string;
  status: string;
  photo_url: string | null;
  size_length: number | null;
  size_width: number | null;
};

type RugServiceLookup = {
  rug_id: string;
  service_name: string | null;
};

type JobItemView = PickupItemRow & {
  linkedRug: RugLookup | null;
  linkedServices: string[];
};

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
  const [editor, setEditor] = useState<ItemEditorState | null>(null);
  const [saving, setSaving] = useState(false);

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
      if (requests.length === 0) {
        setJobs([]);
        setLoading(false);
        return;
      }

      const requestIds = requests.map((request) => request.id);
      const { data: itemData, error: itemError } = await supabaseExtended
        .from("pickup_request_items")
        .select("id, pickup_request_id, rug_number, rug_type, length, width, verified, checked_in_rug_id, estimate_requested, estimate_request_details")
        .in("pickup_request_id", requestIds);

      if (itemError) throw itemError;

      const items = (itemData ?? []) as PickupItemRow[];
      const checkedInRugIds = items
        .map((item) => item.checked_in_rug_id)
        .filter((value): value is string => Boolean(value));

      let rugMap = new Map<string, RugLookup>();
      const serviceMap = new Map<string, string[]>();

      if (checkedInRugIds.length > 0) {
        const { data: rugData, error: rugError } = await supabase
          .from("rugs")
          .select("id, tag, status, photo_url, size_length, size_width")
          .in("id", checkedInRugIds);

        if (rugError) throw rugError;

        rugMap = new Map(((rugData ?? []) as RugLookup[]).map((rug) => [rug.id, rug]));

        const { data: serviceData, error: serviceError } = await supabase
          .from("rug_services")
          .select("rug_id, service_name")
          .in("rug_id", checkedInRugIds);

        if (serviceError) throw serviceError;

        for (const row of (serviceData ?? []) as RugServiceLookup[]) {
          const current = serviceMap.get(row.rug_id) ?? [];
          const name = row.service_name?.trim();
          if (name && !current.includes(name)) current.push(name);
          serviceMap.set(row.rug_id, current);
        }
      }

      const requestById = new Map(requests.map((request) => [request.id, request]));
      const grouped = new Map<string, JobView>();

      for (const request of requests) {
        const key = `${request.client_id}__${request.scheduled_date}`;
        const existing = grouped.get(key);
        if (existing) {
          existing.requestIds.push(request.id);
          if (!existing.statuses.includes(request.status)) existing.statuses.push(request.status);
          if (request.notes?.trim()) existing.notes.push(request.notes.trim());
          existing.updatedAt = latestIso([existing.updatedAt, request.updated_at]);
          continue;
        }

        grouped.set(key, {
          key,
          clientId: request.client_id,
          clientName: request.clients?.name ?? "Unknown client",
          clientAddress: request.clients?.address ?? null,
          scheduledDate: request.scheduled_date,
          routeDay: request.route_day || "Unassigned",
          requestIds: [request.id],
          primaryRequestId: request.id,
          statuses: [request.status],
          updatedAt: request.updated_at,
          notes: request.notes?.trim() ? [request.notes.trim()] : [],
          items: [],
        });
      }

      for (const item of items) {
        const request = requestById.get(item.pickup_request_id);
        if (!request) continue;
        const key = `${request.client_id}__${request.scheduled_date}`;
        const job = grouped.get(key);
        if (!job) continue;
        const linkedRug = item.checked_in_rug_id ? rugMap.get(item.checked_in_rug_id) ?? null : null;
        const linkedServices = item.checked_in_rug_id ? serviceMap.get(item.checked_in_rug_id) ?? [] : [];
        job.items.push({ ...item, linkedRug, linkedServices });
      }

      const nextJobs = Array.from(grouped.values())
        .map((job) => ({
          ...job,
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

  const pagination = usePaginatedList(filteredJobs);

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
        <LoadingState title="Loading jobs" description="Grouping rugs by client and pickup date..." />
      </div>
    );
  }

  return (
    <div className="app-page h-full overflow-auto space-y-5 animate-fade-in-up">
      <section className="app-section">
        <div className="app-section-header gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Jobs</h2>
            <p className="text-sm text-muted-foreground">Office workspace grouped by client + pickup date.</p>
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
                <SelectValue placeholder="All route days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All route days</SelectItem>
                <SelectItem value="Unassigned">Unassigned</SelectItem>
                {DAYS_OF_WEEK.map((day) => (
                  <SelectItem key={day} value={day}>{day}</SelectItem>
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
          const checkedInCount = job.items.filter((item) => item.checked_in_rug_id).length;
          const estimateCount = job.items.filter((item) => item.estimate_requested).length;
          const verifiedCount = job.items.filter((item) => item.verified).length;
          const statusSet = [...job.statuses].sort();

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
                  {job.clientAddress ? <p className="pl-6 text-xs text-muted-foreground">{job.clientAddress}</p> : null}
                  <div className="flex flex-wrap gap-2 pl-6">
                    <Badge variant="secondary">{job.items.length} rug{job.items.length === 1 ? "" : "s"}</Badge>
                    <Badge variant="secondary">{checkedInCount} checked in</Badge>
                    <Badge variant="secondary">{verifiedCount} truck-confirmed</Badge>
                    {estimateCount > 0 ? <Badge variant="secondary">{estimateCount} estimate request{estimateCount === 1 ? "" : "s"}</Badge> : null}
                    {statusSet.map((status) => (
                      <PickupStatusBadge key={`${job.key}-${status}`} status={status} />
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 pt-1">
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
                </div>
              </button>

              {expanded ? (
                <div className="space-y-4 border-t border-border/70 px-4 py-4">
                  {job.notes.length > 0 ? (
                    <div className="rounded-xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{job.notes.join(" · ")}</div>
                  ) : null}

                  <div className="space-y-3">
                    {job.items.map((item) => (
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
                            {item.linkedServices.length > 0 ? (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {item.linkedServices.map((service) => (
                                  <Badge key={`${item.id}-${service}`} variant="secondary">{service}</Badge>
                                ))}
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
                              <Button size="sm" variant="outline" onClick={() => openEditDialog(item)}>
                                <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void removeItem(item)}>
                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                              </Button>
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
