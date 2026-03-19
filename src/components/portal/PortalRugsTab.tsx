import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { usePortalClient } from "@/hooks/usePortalClient";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { Search } from "lucide-react";

import { PortalRugDetailPanel } from "./PortalRugDetailPanel";
import {
  type RugRow,
  type EstimateRow,
  type EstimateItemRow,
  STATUS_LABELS,
  STATUS_VARIANTS,
  ACTIVE_STATUSES,
  formatDate,
} from "./portal-rug-types";

// ---------------------------------------------------------------------------
// Local types (not shared)
// ---------------------------------------------------------------------------

type PickupItemRow = {
  rug_number: string;
  pickup_request_id: string;
  estimate_requested: boolean;
};

type PickupRequestRow = {
  id: string;
  scheduled_date: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 250;

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

  // Side panel detail
  const [selectedRug, setSelectedRug] = useState<RugRow | null>(null);
  const [estimatesByRugId, setEstimatesByRugId] = useState<Record<string, EstimateRow[]>>({});
  const [lineItemsByEstimateId, setLineItemsByEstimateId] = useState<Record<string, EstimateItemRow[]>>({});
  const [loadingEstimates, setLoadingEstimates] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

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
      if (estimatesByRugId[rug.id]) return; // already loaded
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
    [estimatesByRugId, toast],
  );

  // ------ Select rug (open side panel) ------
  const handleSelectRug = useCallback(
    (rug: RugRow) => {
      setSelectedRug(rug);
      fetchEstimatesForRug(rug);
    },
    [fetchEstimatesForRug],
  );

  // ------ Line-item approve/reject ------
  const updateLineItemDecision = useCallback(
    async (item: EstimateItemRow, approved: boolean) => {
      if (item.client_approved !== null) return;
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
  const pageRugIds = new Set(pagination.items.map((r) => r.id));

  // ------ Render helpers ------

  const renderRugRow = (rug: RugRow) => (
    <button
      key={rug.id}
      onClick={() => handleSelectRug(rug)}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors cursor-pointer"
    >
      <span className="text-sm font-medium w-20 shrink-0">{rug.tag}</span>
      <span className="text-sm text-muted-foreground w-24 shrink-0 truncate">{rug.description || "Rug"}</span>
      <span className="text-sm text-muted-foreground flex-1 truncate hidden sm:block">
        {rug.services.join(", ")}
      </span>
      <Badge variant={STATUS_VARIANTS[rug.status]} className="text-[11px] shrink-0">
        {STATUS_LABELS[rug.status]}
      </Badge>
    </button>
  );

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

      {/* Side panel for rug details */}
      <PortalRugDetailPanel
        rug={selectedRug}
        open={selectedRug !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedRug(null);
        }}
        estimates={selectedRug ? estimatesByRugId[selectedRug.id] : undefined}
        lineItemsByEstimateId={lineItemsByEstimateId}
        loadingEstimates={loadingEstimates === selectedRug?.id}
        estimateRequested={selectedRug ? (estimateRequestedByTag[selectedRug.tag] ?? false) : false}
        onLineItemDecision={updateLineItemDecision}
        updatingItemId={updatingItemId}
      />
    </div>
  );
}
