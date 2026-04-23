import { useCallback, useEffect, useMemo, useState } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { PortalTabProps } from "./portal-tab-props";
import { supabase } from "@/integrations/supabase/client";
import {
  supabaseExtended,
} from "@/integrations/supabase/extended";
import {
  type EstimateRow,
  type RugEstimateSummary,
  type RugRow,
  ACTIVE_STATUSES,
} from "./portal-rug-types";
import PortalRugCard from "./PortalRugCard";
import PortalRugDetailPanel from "./PortalRugDetailPanel";

export default function PortalRugsTab({ clientId, loading: portalClientLoading, errorMessage }: PortalTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rugs, setRugs] = useState<RugRow[]>([]);
  const [selectedRug, setSelectedRug] = useState<RugRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [estimateSummaryByRugId, setEstimateSummaryByRugId] = useState<Record<string, RugEstimateSummary>>({});

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadEstimateSummaries = useCallback(async (activeRugs: RugRow[]) => {
    if (activeRugs.length === 0) {
      setEstimateSummaryByRugId({});
      return;
    }

    const { data, error } = await supabaseExtended
      .from("estimates")
      .select("id, rug_id, estimate_number, status, total, created_at")
      .in("rug_id", activeRugs.map((rug) => rug.id))
      .order("created_at", { ascending: false })
      .returns<EstimateRow[]>();

    if (error) {
      toast({ title: "Failed to load rug estimate context", description: error.message, variant: "destructive" });
      setEstimateSummaryByRugId({});
      return;
    }

    const next: Record<string, RugEstimateSummary> = {};
    for (const estimate of data ?? []) {
      if (!estimate.rug_id || next[estimate.rug_id]) continue;
      next[estimate.rug_id] = {
        estimateNumber: estimate.estimate_number,
        status: estimate.status,
        total: Number(estimate.total ?? 0),
      };
    }
    setEstimateSummaryByRugId(next);
  }, [toast]);

  // Load rugs
  useEffect(() => {
    if (portalClientLoading) { setLoading(true); return; }
    if (errorMessage) {
      toast({ title: "No portal access", description: errorMessage, variant: "destructive" });
      setLoading(false); setRugs([]); return;
    }
    if (!clientId) { setLoading(false); return; }

    const loadRugs = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("rugs")
        .select("id, tag, description, services, size_length, size_width, checked_in_at, status, notes, photo_url")
        .eq("client_id", clientId)
        .in("status", ACTIVE_STATUSES)
        .order("checked_in_at", { ascending: false })
        .limit(250)
        .returns<RugRow[]>();

      if (error) {
        toast({ title: "Failed to load rugs", description: error.message, variant: "destructive" });
        setRugs([]); setLoading(false); return;
      }

      const loadedRugs = data ?? [];
      setRugs(loadedRugs);

      await loadEstimateSummaries(loadedRugs);
      setLoading(false);
    };

    loadRugs();
  }, [clientId, errorMessage, portalClientLoading, toast, loadEstimateSummaries]);

  // Filter rugs by search
  const filteredRugs = useMemo(() => {
    if (!debouncedSearch) return rugs;
    const q = debouncedSearch.toLowerCase();
    return rugs.filter((r) => r.tag.toLowerCase().includes(q));
  }, [rugs, debouncedSearch]);

  const pagination = usePaginatedList(filteredRugs);

  const handleCardClick = (rug: RugRow) => {
    setSelectedRug(rug);
    setPanelOpen(true);
  };

  if (portalClientLoading || loading) {
    return <div className="rounded-2xl border border-border/70 bg-card/90 px-4 py-5 text-sm text-muted-foreground">Loading rugs…</div>;
  }

  if (!clientId) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card/90 px-4 py-5 text-sm text-muted-foreground">
        {errorMessage ?? "This login is not linked to an active wholesale portal account."}
      </div>
    );
  }

  if (rugs.length === 0) {
    return (
      <div className="space-y-1 rounded-2xl border border-dashed border-border/70 bg-card/70 px-4 py-5 text-sm text-muted-foreground">
        <p>No active rugs right now.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by rug number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 rounded-2xl border-border/70 bg-background/90 pl-9"
        />
      </div>

      {/* Search results (flat list) */}
      {debouncedSearch ? (
        <>
          {pagination.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rugs matching &ldquo;{debouncedSearch}&rdquo;</p>
          ) : (
            <div className="space-y-3">
              {pagination.items.map((rug) => (
                <PortalRugCard key={rug.id} rug={rug} estimateSummary={estimateSummaryByRugId[rug.id] ?? null} onClick={() => handleCardClick(rug)} />
              ))}
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
            label="rugs"
          />
        </>
      ) : (
        <>
          <div className="space-y-3">
            {pagination.items.map((rug) => (
              <PortalRugCard key={rug.id} rug={rug} estimateSummary={estimateSummaryByRugId[rug.id] ?? null} onClick={() => handleCardClick(rug)} />
            ))}
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
      )}

      {/* Detail side panel */}
      <PortalRugDetailPanel
        rug={selectedRug}
        estimateSummary={selectedRug ? estimateSummaryByRugId[selectedRug.id] ?? null : null}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </div>
  );
}
