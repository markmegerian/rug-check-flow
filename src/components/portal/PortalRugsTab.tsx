import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePortalClient } from "@/hooks/usePortalClient";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import type { EstimateStatus } from "@/lib/workflow-guards";
import { ChevronDown, ChevronRight, Search, Check, X } from "lucide-react";
import type { Enums } from "@/integrations/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RugStatus = Enums<"rug_status">;

type RugRow = {
  id: string;
  tag: string;
  description: string;
  services: string[];
  size_length: number | null;
  size_width: number | null;
  checked_in_at: string;
  status: RugStatus;
  notes: string;
  photo_url: string | null;
};

type PickupItemRow = {
  rug_number: string;
  pickup_request_id: string;
  estimate_requested: boolean;
};

type PickupRequestRow = {
  id: string;
  scheduled_date: string;
};

type EstimateRow = {
  id: string;
  rug_id: string;
  estimate_number: string;
  status: EstimateStatus;
  total: number;
};

type EstimateItemRow = {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  client_approved: boolean | null;
  client_decision_at: string | null;
  service_category: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<RugStatus, string> = {
  checked_in: "Checked In",
  in_production: "In Production",
  ready: "Ready for Pickup",
  picked_up: "Delivered",
};

const STATUS_VARIANTS: Record<RugStatus, "default" | "secondary" | "outline"> = {
  checked_in: "default",
  in_production: "default",
  ready: "secondary",
  picked_up: "outline",
};

const ACTIVE_STATUSES: RugStatus[] = ["checked_in", "in_production", "ready"];

const DEBOUNCE_MS = 250;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCleaningLineItem(item: EstimateItemRow): boolean {
  return item.service_category?.toLowerCase() === "cleaning";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const estimateStatusBadge = (status: EstimateStatus) => {
  if (status === "sent")
    return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Pending approval</Badge>;
  if (status === "approved")
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Approved</Badge>;
  if (status === "rejected")
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Rejected</Badge>;
  if (status === "expired") return <Badge variant="secondary">Expired</Badge>;
  return <Badge variant="outline">Draft</Badge>;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PortalRugsTab() {
  const { toast } = useToast();
  const { clientId, loading: portalClientLoading, errorMessage } = usePortalClient();

  // Core data
  const [rugs, setRugs] = useState<RugRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Pickup grouping maps: tag -> scheduled_date, tag -> estimate_requested
  const [pickupDateByTag, setPickupDateByTag] = useState<Record<string, string>>({});
  const [estimateRequestedByTag, setEstimateRequestedByTag] = useState<Record<string, boolean>>({});

  // Search
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  // Expand / detail
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [estimatesByRugId, setEstimatesByRugId] = useState<Record<string, EstimateRow[]>>({});
  const estimatesByRugIdRef = useRef(estimatesByRugId);
  estimatesByRugIdRef.current = estimatesByRugId;
  const [lineItemsByEstimateId, setLineItemsByEstimateId] = useState<Record<string, EstimateItemRow[]>>({});
  const [loadingEstimates, setLoadingEstimates] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const updatingItemIdRef = useRef(updatingItemId);
  updatingItemIdRef.current = updatingItemId;

  // ------ Debounced search ------
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedSearch(searchInput.trim()), DEBOUNCE_MS);
    return () => clearTimeout(debounceTimer.current);
  }, [searchInput]);

  // ------ Load rugs + pickup grouping ------
  useEffect(() => {
    if (portalClientLoading) {
      setLoading(true);
      return;
    }
    if (errorMessage) {
      toast({ title: "No portal access", description: errorMessage, variant: "destructive" });
      setLoading(false);
      setRugs([]);
      return;
    }
    if (!clientId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);

      // 1. Fetch rugs
      const { data: rugData, error: rugError } = await supabase
        .from("rugs")
        .select("id, tag, description, services, size_length, size_width, checked_in_at, status, notes, photo_url")
        .eq("client_id", clientId)
        .order("checked_in_at", { ascending: false })
        .limit(250)
        .returns<RugRow[]>();

      if (rugError) {
        toast({ title: "Failed to load rugs", description: rugError.message, variant: "destructive" });
        setRugs([]);
        setLoading(false);
        return;
      }

      const rows = rugData ?? [];
      setRugs(rows);

      // 2. Fetch pickup_request_items for these tags
      const tags = rows.map((r) => r.tag).filter(Boolean);
      if (tags.length > 0) {
        const { data: priData } = await supabaseExtended
          .from("pickup_request_items")
          .select("rug_number, pickup_request_id, estimate_requested")
          .in("rug_number", tags)
          .returns<PickupItemRow[]>();

        const items = priData ?? [];

        // Build estimate_requested map
        const erMap: Record<string, boolean> = {};
        items.forEach((i) => {
          if (i.estimate_requested) erMap[i.rug_number] = true;
        });
        setEstimateRequestedByTag(erMap);

        // 3. Fetch pickup_requests for scheduled_date
        const prIds = [...new Set(items.map((i) => i.pickup_request_id))];
        if (prIds.length > 0) {
          const { data: prData } = await supabaseExtended
            .from("pickup_requests")
            .select("id, scheduled_date")
            .in("id", prIds)
            .returns<PickupRequestRow[]>();

          const dateById: Record<string, string> = {};
          (prData ?? []).forEach((pr) => {
            dateById[pr.id] = pr.scheduled_date;
          });

          const tagDateMap: Record<string, string> = {};
          items.forEach((i) => {
            const d = dateById[i.pickup_request_id];
            if (d) tagDateMap[i.rug_number] = d;
          });
          setPickupDateByTag(tagDateMap);
        } else {
          setPickupDateByTag({});
        }
      } else {
        setPickupDateByTag({});
        setEstimateRequestedByTag({});
      }

      setLoading(false);
    };

    load();
  }, [clientId, errorMessage, portalClientLoading, toast]);

  // ------ Lazy-fetch estimates for a rug ------
  const fetchEstimatesForRug = useCallback(
    async (rug: RugRow) => {
      if (estimatesByRugIdRef.current[rug.id]) return; // already loaded
      setLoadingEstimates(rug.id);

      const { data: estData, error: estError } = await supabaseExtended
        .from("estimates")
        .select("id, rug_id, estimate_number, status, total")
        .eq("rug_id", rug.id)
        .order("created_at", { ascending: false })
        .returns<EstimateRow[]>();

      if (estError) {
        toast({ title: "Failed to load estimates", description: estError.message, variant: "destructive" });
        setLoadingEstimates(null);
        return;
      }

      const estimates = estData ?? [];
      setEstimatesByRugId((prev) => ({ ...prev, [rug.id]: estimates }));

      // Fetch line items for sent estimates
      const sentIds = estimates.filter((e) => e.status === "sent").map((e) => e.id);
      if (sentIds.length > 0) {
        const { data: itemsData } = await supabaseExtended
          .from("estimate_items")
          .select("id, estimate_id, description, quantity, unit_price, total, client_approved, client_decision_at, service_category")
          .in("estimate_id", sentIds)
          .order("estimate_id")
          .returns<EstimateItemRow[]>();

        const byEstimate: Record<string, EstimateItemRow[]> = {};
        (itemsData ?? []).forEach((item) => {
          if (!byEstimate[item.estimate_id]) byEstimate[item.estimate_id] = [];
          byEstimate[item.estimate_id].push(item);
        });
        setLineItemsByEstimateId((prev) => ({ ...prev, ...byEstimate }));
      }

      setLoadingEstimates(null);
    },
    [toast],
  );

  // ------ Toggle expand ------
  const toggleExpand = useCallback(
    (rug: RugRow) => {
      setExpandedRow((prev) => {
        const next = prev === rug.id ? null : rug.id;
        if (next) fetchEstimatesForRug(rug);
        return next;
      });
    },
    [fetchEstimatesForRug],
  );

  // ------ Line-item approve/reject ------
  const updateLineItemDecision = useCallback(
    async (item: EstimateItemRow, approved: boolean) => {
      if (item.client_approved !== null) return;
      if (updatingItemIdRef.current) return; // prevent double-click
      setUpdatingItemId(item.id);
      const nowIso = new Date().toISOString();

      const { error } = await supabaseExtended
        .from("estimate_items")
        .update({ client_approved: approved, client_decision_at: nowIso })
        .eq("id", item.id);

      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
        setUpdatingItemId(null);
        return;
      }

      setLineItemsByEstimateId((prev) => ({
        ...prev,
        [item.estimate_id]: (prev[item.estimate_id] ?? []).map((i) =>
          i.id === item.id ? { ...i, client_approved: approved, client_decision_at: nowIso } : i,
        ),
      }));
      toast({ title: approved ? "Line approved" : "Line rejected" });
      setUpdatingItemId(null);
    },
    [toast],
  );

  // ------ Derived lists ------
  const isSearching = debouncedSearch.length > 0;

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = debouncedSearch.toLowerCase();
    return rugs.filter((r) => r.tag.toLowerCase().includes(q));
  }, [rugs, debouncedSearch, isSearching]);

  const activeRugs = useMemo(
    () => rugs.filter((r) => ACTIVE_STATUSES.includes(r.status)),
    [rugs],
  );

  // Group active rugs by pickup date
  const groupedRugs = useMemo(() => {
    const groups: { label: string; sortKey: string; rugs: RugRow[] }[] = [];
    const byDate: Record<string, RugRow[]> = {};
    const other: RugRow[] = [];

    activeRugs.forEach((rug) => {
      const date = pickupDateByTag[rug.tag];
      if (date) {
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(rug);
      } else {
        other.push(rug);
      }
    });

    Object.keys(byDate)
      .sort()
      .forEach((date) => {
        groups.push({ label: formatDate(date), sortKey: date, rugs: byDate[date] });
      });

    if (other.length > 0) {
      groups.push({ label: "Other", sortKey: "zzz", rugs: other });
    }

    return groups;
  }, [activeRugs, pickupDateByTag]);

  // Flat list for pagination (search mode or default mode)
  const displayList = isSearching ? searchResults : activeRugs;
  const pagination = usePaginatedList(displayList);
  const { resetPage } = pagination;

  useEffect(() => {
    resetPage();
  }, [debouncedSearch, resetPage]);

  // ------ Early returns ------
  if (portalClientLoading || loading) {
    return <div className="text-sm text-muted-foreground">Loading rugs...</div>;
  }

  if (!clientId) {
    return (
      <div className="text-sm text-muted-foreground">
        {errorMessage ?? "This login is not linked to an active wholesale portal account."}
      </div>
    );
  }

  if (rugs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground space-y-1">
        <p>No rugs available yet.</p>
        <p>To schedule a pickup for new rugs, use the Pickups tab.</p>
      </div>
    );
  }

  // ------ Build page set for grouped view ------
  // When not searching, we render groups. We still paginate the flat active list
  // and figure out which groups/rugs fall on the current page.
  const pageRugIds = new Set(pagination.items.map((r) => r.id));

  // ------ Render helpers ------

  const renderRugRow = (rug: RugRow) => {
    const isExpanded = expandedRow === rug.id;
    return (
      <div key={rug.id}>
        <button
          onClick={() => toggleExpand(rug)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        >
          <span className="text-muted-foreground">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
          <span className="text-sm font-medium w-20 shrink-0">{rug.tag}</span>
          <span className="text-sm text-muted-foreground w-24 shrink-0 truncate">{rug.description || "Rug"}</span>
          <span className="text-sm text-muted-foreground flex-1 truncate hidden sm:block">
            {rug.services.join(", ")}
          </span>
          <Badge variant={STATUS_VARIANTS[rug.status]} className="text-[11px] shrink-0">
            {STATUS_LABELS[rug.status]}
          </Badge>
        </button>
        {isExpanded && renderExpandedDetail(rug)}
      </div>
    );
  };

  const renderExpandedDetail = (rug: RugRow) => {
    const estimates = estimatesByRugId[rug.id];
    const isLoadingEst = loadingEstimates === rug.id;
    const estimateRequested = estimateRequestedByTag[rug.tag] ?? false;

    return (
      <div className="px-4 pb-4 pl-12 space-y-4">
        {/* Basic info */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">Size</span>
            <p>{Number(rug.size_length ?? 0)}' x {Number(rug.size_width ?? 0)}'</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Description</span>
            <p>{rug.description || "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Status</span>
            <p>{STATUS_LABELS[rug.status]}</p>
          </div>
          <div className="col-span-2 sm:col-span-3">
            <span className="text-muted-foreground text-xs">Services</span>
            <p>{rug.services.length > 0 ? rug.services.join(", ") : "—"}</p>
          </div>
        </div>

        {/* Notes */}
        {rug.notes && (
          <div className="text-sm">
            <span className="text-muted-foreground text-xs">Notes</span>
            <p className="whitespace-pre-wrap">{rug.notes}</p>
          </div>
        )}

        {/* Estimate requested */}
        {estimateRequested && (
          <div className="text-sm">
            <Badge variant="outline" className="text-xs">Estimate requested</Badge>
          </div>
        )}

        {/* Photo */}
        {rug.photo_url && (
          <div>
            <span className="text-muted-foreground text-xs block mb-1">Photo</span>
            <img
              src={rug.photo_url}
              alt={`Rug ${rug.tag}`}
              className="max-w-xs rounded border"
            />
          </div>
        )}

        {/* Estimates */}
        <div>
          <span className="text-muted-foreground text-xs block mb-1">Estimates</span>
          {isLoadingEst ? (
            <p className="text-xs text-muted-foreground">Loading estimates...</p>
          ) : !estimates || estimates.length === 0 ? (
            <p className="text-xs text-muted-foreground">No estimates for this rug.</p>
          ) : (
            <div className="space-y-3">
              {estimates.map((est) => renderEstimate(est))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderEstimate = (est: EstimateRow) => {
    const lineItems = lineItemsByEstimateId[est.id] ?? [];

    return (
      <div key={est.id} className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium text-sm text-foreground">{est.estimate_number}</p>
            <p className="text-xs text-muted-foreground">Total ${Number(est.total).toFixed(2)}</p>
          </div>
          {estimateStatusBadge(est.status)}
        </div>

        {est.status === "sent" && lineItems.length > 0 && (
          <div className="rounded border bg-background p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Line items</p>
            <ul className="text-sm space-y-2">
              {lineItems.map((item) => {
                const isCleaning = isCleaningLineItem(item);
                const decided = item.client_approved !== null;
                const isUpdating = updatingItemId === item.id;
                const qty = Number(item.quantity);
                const unit = Number(item.unit_price);
                const lineTotal = Number(item.total);

                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border/60 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground font-medium">{item.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {qty} x ${unit.toFixed(2)} = ${lineTotal.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isCleaning ? (
                        <Badge variant="secondary" className="text-xs">Included</Badge>
                      ) : decided ? (
                        item.client_approved ? (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Approved</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Rejected</Badge>
                        )
                      ) : (
                        <>
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => updateLineItemDecision(item, true)}
                            disabled={isUpdating}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs"
                            onClick={() => updateLineItemDecision(item, false)}
                            disabled={isUpdating}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // ------ Main render ------

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by rug number..."
          className="pl-9"
        />
      </div>

      {/* Results */}
      {isSearching ? (
        // Search mode: flat list
        searchResults.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rugs matching "{debouncedSearch}".</p>
        ) : (
          <>
            <div className="rounded-lg border bg-background divide-y">
              {pagination.items.map(renderRugRow)}
            </div>
            <PaginationControls
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              hasPrev={pagination.hasPrev}
              hasNext={pagination.hasNext}
              onPrev={pagination.prevPage}
              onNext={pagination.nextPage}
              label="rugs"
            />
          </>
        )
      ) : activeRugs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active rugs at the facility right now.</p>
      ) : (
        // Default mode: grouped by pickup date, paginated across the flat list
        <>
          {groupedRugs.map((group) => {
            const visibleRugs = group.rugs.filter((r) => pageRugIds.has(r.id));
            if (visibleRugs.length === 0) return null;
            return (
              <div key={group.sortKey}>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-1">
                  {group.label}
                </h3>
                <div className="rounded-lg border bg-background divide-y">
                  {visibleRugs.map(renderRugRow)}
                </div>
              </div>
            );
          })}
          <PaginationControls
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            hasPrev={pagination.hasPrev}
            hasNext={pagination.hasNext}
            onPrev={pagination.prevPage}
            onNext={pagination.nextPage}
            label="rugs"
          />
        </>
      )}
    </div>
  );
}
