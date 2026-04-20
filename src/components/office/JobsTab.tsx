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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { LoadingState } from "@/components/states/PageState";
import { InvoiceStatusBadge, RugStatusBadge } from "@/components/shared/StatusBadge";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";
import {
  type JobItemView,
  type JobView,
} from "@/lib/jobs-view";
import { fetchJobsSummary } from "@/lib/jobs-summary";

type JobFilter = "all" | "estimate_open" | "uninvoiced" | "delivered" | "returns" | "attention";

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

export function JobsTab({ onOpenRug }: { onOpenRug: (rugId: string) => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [search, setSearch] = useState("");
  const [sourceTab, setSourceTab] = useState<"pickup" | "walkin">("pickup");
  const [sourceTabTouched, setSourceTabTouched] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [jobFilters, setJobFilters] = useState<Record<string, JobFilter>>({});
  const [editor, setEditor] = useState<ItemEditorState | null>(null);
  const [noteEditor, setNoteEditor] = useState<JobNoteEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const nextJobs = await fetchJobsSummary();

      setJobs(nextJobs);
      if (!sourceTabTouched) {
        const newestSource = nextJobs[0]?.sourceType;
        if (newestSource === "pickup" || newestSource === "walkin") {
          setSourceTab(newestSource);
        }
      }
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
  }, [sourceTabTouched, toast]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return jobs.filter((job) => {
      if (job.sourceType !== sourceTab) return false;
      if (!query) return true;
      const haystacks = [job.clientName.toLowerCase(), job.scheduledDate.toLowerCase(), job.routeDay.toLowerCase()];
      if (haystacks.some((value) => value.includes(query))) return true;
      return job.items.some((item) => {
        const rugValues = [item.rug_number, item.rug_type ?? "", item.linkedRug?.tag ?? "", ...(item.linkedServices ?? [])];
        return rugValues.some((value) => value.toLowerCase().includes(query));
      });
    });
  }, [jobs, search, sourceTab]);

  const sourceCounts = useMemo(
    () => ({
      pickup: jobs.filter((job) => job.sourceType === "pickup").length,
      walkin: jobs.filter((job) => job.sourceType === "walkin").length,
    }),
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
            <p className="text-sm text-muted-foreground">Pickup and walk-in rug history, grouped by day entered or received.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="overflow-x-auto">
              <Tabs value={sourceTab} onValueChange={(value) => {
                setSourceTabTouched(true);
                setSourceTab(value as "pickup" | "walkin");
              }}>
                <TabsList>
                  <TabsTrigger value="pickup" className="gap-1.5">
                    Pickups
                    <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">{sourceCounts.pickup}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="walkin" className="gap-1.5">
                    Walk-ins
                    <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1.5 text-xs">{sourceCounts.walkin}</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search client or rug number…"
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </section>

      {filteredJobs.length === 0 ? (
        <div className="app-section rounded-2xl border border-dashed border-border/70 bg-card/70 p-8 text-center text-muted-foreground">
          No {sourceTab === "pickup" ? "pickup" : "walk-in"} jobs match the current filters.
        </div>
      ) : (
        pagination.items.map((job) => {
          const expanded = expandedJobs[job.key] ?? true;
          const activeJobFilter = jobFilters[job.key] ?? "all";
          const estimateCount = job.items.filter((item) => item.estimate_requested).length;
          const estimateRespondedCount = job.items.filter((item) => item.latestEstimateResponse).length;
          const openEstimateCount = Math.max(estimateCount - estimateRespondedCount, 0);
          const deliveredCount = job.items.filter((item) => item.linkedRug?.status === "delivered").length;
          const uninvoicedCount = job.items.filter((item) => !item.linkedInvoice).length;
          const returnCount = job.items.filter((item) => item.latestReturnState?.state === "open").length;
          const attentionCount = job.items.filter((item) => item.latestReturnState?.state === "open" || (item.estimate_requested && !item.latestEstimateResponse) || (!item.linkedInvoice && item.linkedRug?.status === "ready")).length;
          const visibleItems = job.items.filter((item) => {
            if (activeJobFilter === "estimate_open") return item.estimate_requested && !item.latestEstimateResponse;
            if (activeJobFilter === "uninvoiced") return !item.linkedInvoice;
            if (activeJobFilter === "delivered") return item.linkedRug?.status === "delivered";
            if (activeJobFilter === "returns") return item.latestReturnState?.state === "open";
            if (activeJobFilter === "attention") return item.latestReturnState?.state === "open" || (item.estimate_requested && !item.latestEstimateResponse) || (!item.linkedInvoice && item.linkedRug?.status === "ready");
            return true;
          });
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
