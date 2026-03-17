import { useCallback, useEffect, useMemo, useState } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/states/PageState";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { format } from "date-fns";
import { Search } from "lucide-react";

type DisputeType = "refused_delivery" | "post_delivery_claim";
type DisputeStatus = "open" | "investigating" | "resolved" | "credited" | "denied";

interface DisputeRow {
  id: string;
  rug_id: string;
  client_id: string;
  type: DisputeType;
  status: DisputeStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  clients: { name: string } | null;
  rugs: { tag: string } | null;
}

const STATUS_ORDER: DisputeStatus[] = ["open", "investigating", "resolved", "credited", "denied"];

const STATUS_LABELS: Record<DisputeStatus, string> = {
  open: "Open",
  investigating: "Investigating",
  resolved: "Resolved",
  credited: "Credited",
  denied: "Denied",
};

const TYPE_LABELS: Record<DisputeType, string> = {
  refused_delivery: "Refused Delivery",
  post_delivery_claim: "Post-Delivery Claim",
};

const STATUS_BADGE_CLASSES: Record<DisputeStatus, string> = {
  open: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  investigating: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  credited: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  denied: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

const VALID_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  open: ["investigating"],
  investigating: ["resolved", "credited", "denied"],
  resolved: [],
  credited: [],
  denied: [],
};

export function DisputesTab() {
  const { toast } = useToast();
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickFilter, setQuickFilter] = useState<DisputeStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<Record<string, DisputeStatus>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabaseExtended
      .from("disputes")
      .select("*, clients(name), rugs(tag)")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Failed to load disputes", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    setDisputes((data as unknown as DisputeRow[]) ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchDisputes();
  }, [fetchDisputes]);

  const filteredDisputes = useMemo(() => {
    let filtered = [...disputes];

    if (quickFilter !== "all") {
      filtered = filtered.filter((d) => d.status === quickFilter);
    }

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      filtered = filtered.filter(
        (d) => d.clients?.name?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [disputes, quickFilter, search]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: disputes.length };
    for (const d of disputes) {
      counts[d.status] = (counts[d.status] ?? 0) + 1;
    }
    return counts;
  }, [disputes]);

  const pagination = usePaginatedList(filteredDisputes);

  const updateStatus = async (id: string) => {
    const newStatus = statusDraft[id];
    if (!newStatus) return;

    setUpdatingId(id);

    const updatePayload: { status: DisputeStatus; notes?: string } = { status: newStatus };
    const draftNotes = notesDraft[id]?.trim();
    if (draftNotes) {
      const existing = disputes.find((d) => d.id === id);
      const combinedNotes = existing?.notes
        ? `${existing.notes}\n\n[${format(new Date(), "MMM d, yyyy")}] ${draftNotes}`
        : `[${format(new Date(), "MMM d, yyyy")}] ${draftNotes}`;
      updatePayload.notes = combinedNotes;
    }

    const { error } = await supabaseExtended
      .from("disputes")
      .update(updatePayload)
      .eq("id", id);

    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      setUpdatingId(null);
      return;
    }

    toast({ title: "Dispute updated", description: `Status set to ${STATUS_LABELS[newStatus]}.` });
    setStatusDraft((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setNotesDraft((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setUpdatingId(null);
    fetchDisputes();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingState title="Loading disputes" description="Fetching dispute records..." />
      </div>
    );
  }

  if (disputes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No disputes
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 overflow-auto h-full space-y-5 animate-fade-in-up">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-foreground">Disputes</h2>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by client name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {(["all", ...STATUS_ORDER] as const).map((s) => {
          const count = statusCounts[s] ?? 0;
          const active = quickFilter === s;
          return (
            <button
              key={s}
              onClick={() => setQuickFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/50 text-muted-foreground border-border hover:border-primary hover:text-foreground"
              }`}
            >
              {s === "all" ? "All" : STATUS_LABELS[s]} ({count})
            </button>
          );
        })}
      </div>

      {filteredDisputes.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          No disputes match the current filter.
        </div>
      ) : (
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rug Tag</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Notes</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pagination.items.map((dispute) => {
                  const transitions = VALID_TRANSITIONS[dispute.status];
                  const hasDraft = statusDraft[dispute.id] !== undefined;

                  return (
                    <tr key={dispute.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {format(new Date(dispute.created_at), "MMM d, yyyy")}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {dispute.clients?.name ?? "Unknown"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                        {dispute.rugs?.tag ?? "-"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {TYPE_LABELS[dispute.type]}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Badge className={STATUS_BADGE_CLASSES[dispute.status]}>
                          {STATUS_LABELS[dispute.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-xs text-muted-foreground truncate">
                          {dispute.notes ?? "-"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {transitions.length > 0 ? (
                          <div className="space-y-2 min-w-[220px]">
                            <Select
                              value={statusDraft[dispute.id] ?? ""}
                              onValueChange={(v) =>
                                setStatusDraft((prev) => ({ ...prev, [dispute.id]: v as DisputeStatus }))
                              }
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Change status..." />
                              </SelectTrigger>
                              <SelectContent>
                                {transitions.map((s) => (
                                  <SelectItem key={s} value={s}>
                                    {STATUS_LABELS[s]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {hasDraft && (
                              <>
                                <Textarea
                                  placeholder="Add a note (optional)..."
                                  value={notesDraft[dispute.id] ?? ""}
                                  onChange={(e) =>
                                    setNotesDraft((prev) => ({ ...prev, [dispute.id]: e.target.value }))
                                  }
                                  className="text-xs min-h-[60px]"
                                />
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  disabled={updatingId === dispute.id}
                                  onClick={() => updateStatus(dispute.id)}
                                >
                                  {updatingId === dispute.id ? "Updating..." : "Update Status"}
                                </Button>
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <PaginationControls
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        hasPrev={pagination.hasPrev}
        hasNext={pagination.hasNext}
        onPrev={pagination.prevPage}
        onNext={pagination.nextPage}
        label="disputes"
      />
    </div>
  );
}
