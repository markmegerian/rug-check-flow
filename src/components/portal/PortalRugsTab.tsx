import { useCallback, useEffect, useState } from "react";
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

const PAGE_SIZE = 20;

export default function PortalRugsTab({ clientId, loading: portalClientLoading, errorMessage }: PortalTabProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rugs, setRugs] = useState<RugRow[]>([]);
  const [selectedRug, setSelectedRug] = useState<RugRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
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

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, clientId]);

  // Load rugs
  useEffect(() => {
    if (portalClientLoading) { setLoading(true); return; }
    if (errorMessage) {
      toast({ title: "No portal access", description: errorMessage, variant: "destructive" });
      setLoading(false); setRugs([]); setTotal(0); return;
    }
    if (!clientId) { setLoading(false); setRugs([]); setTotal(0); return; }

    const loadRugs = async () => {
      setLoading(true);
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from("rugs")
        .select("id, tag, description, services, size_length, size_width, checked_in_at, status, notes, photo_url", { count: "exact" })
        .eq("client_id", clientId)
        .in("status", ACTIVE_STATUSES)
        .order("checked_in_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);

      if (debouncedSearch) {
        query = query.ilike("tag", `%${debouncedSearch}%`);
      }

      const { data, error, count } = await query.returns<RugRow[]>();

      if (error) {
        toast({ title: "Failed to load rugs", description: error.message, variant: "destructive" });
        setRugs([]); setTotal(0); setLoading(false); return;
      }

      const loadedRugs = data ?? [];
      setRugs(loadedRugs);
      setTotal(count ?? loadedRugs.length);

      await loadEstimateSummaries(loadedRugs);
      setLoading(false);
    };

    loadRugs();
  }, [clientId, debouncedSearch, errorMessage, page, portalClientLoading, toast, loadEstimateSummaries]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;

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
          {rugs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No rugs matching &ldquo;{debouncedSearch}&rdquo;</p>
          ) : (
            <div className="space-y-3">
              {rugs.map((rug) => (
                <PortalRugCard key={rug.id} rug={rug} estimateSummary={estimateSummaryByRugId[rug.id] ?? null} onClick={() => handleCardClick(rug)} />
              ))}
            </div>
          )}
          <PaginationControls
            page={page}
            totalPages={totalPages}
            total={total}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={() => setPage((current) => Math.max(current - 1, 0))}
            onNext={() => setPage((current) => Math.min(current + 1, totalPages - 1))}
            label="rugs"
          />
        </>
      ) : (
        <>
          <div className="space-y-3">
            {rugs.map((rug) => (
              <PortalRugCard key={rug.id} rug={rug} estimateSummary={estimateSummaryByRugId[rug.id] ?? null} onClick={() => handleCardClick(rug)} />
            ))}
          </div>
          <PaginationControls
            page={page}
            totalPages={totalPages}
            total={total}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={() => setPage((current) => Math.max(current - 1, 0))}
            onNext={() => setPage((current) => Math.min(current + 1, totalPages - 1))}
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
