import { useCallback, useEffect, useMemo, useState } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { usePortalClient } from "@/hooks/usePortalClient";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  supabaseExtended,
} from "@/integrations/supabase/extended";
import {
  type RugRow,
  ACTIVE_STATUSES,
} from "./portal-rug-types";
import PortalRugCard from "./PortalRugCard";
import PortalRugDetailPanel from "./PortalRugDetailPanel";

type PickupGroup = {
  label: string;
  date: string | null;
  rugIds: Set<string>;
};

export default function PortalRugsTab() {
  const { toast } = useToast();
  const { clientId, loading: portalClientLoading, errorMessage } = usePortalClient();
  const [loading, setLoading] = useState(true);
  const [rugs, setRugs] = useState<RugRow[]>([]);
  const [selectedRug, setSelectedRug] = useState<RugRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pickupGroups, setPickupGroups] = useState<PickupGroup[]>([]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadPickupGroups = useCallback(async (activeClientId: string, activeRugs: RugRow[]) => {
    const { data: pickupData } = await supabaseExtended
      .from("pickup_requests")
      .select("id, scheduled_date, status")
      .eq("client_id", activeClientId)
      .in("status", ["pending", "confirmed"])
      .order("scheduled_date", { ascending: true })
      .limit(10);

    if (!pickupData || pickupData.length === 0) {
      setPickupGroups([]);
      return;
    }

    const pickupIds = pickupData.map((p) => p.id);
    const { data: itemData } = await supabaseExtended
      .from("pickup_request_items")
      .select("pickup_request_id, rug_number")
      .in("pickup_request_id", pickupIds);

    const rugTagToId = new Map(activeRugs.map((r) => [r.tag, r.id]));
    const groups: PickupGroup[] = [];

    for (const pickup of pickupData) {
      const items = (itemData ?? []).filter((i) => i.pickup_request_id === pickup.id);
      const rugIds = new Set<string>();
      for (const item of items) {
        const id = rugTagToId.get(item.rug_number);
        if (id) rugIds.add(id);
      }
      if (rugIds.size > 0) {
        const d = new Date(`${pickup.scheduled_date}T12:00:00`);
        const label = Number.isNaN(d.getTime())
          ? "Upcoming pickup"
          : d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        groups.push({ label, date: pickup.scheduled_date, rugIds });
      }
    }

    setPickupGroups(groups);
  }, []);

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

      // Load pickup grouping
      await loadPickupGroups(clientId, loadedRugs);
      setLoading(false);
    };

    loadRugs();
  }, [clientId, errorMessage, portalClientLoading, toast, loadPickupGroups]);

  // Filter rugs by search
  const filteredRugs = useMemo(() => {
    if (!debouncedSearch) return rugs;
    const q = debouncedSearch.toLowerCase();
    return rugs.filter((r) => r.tag.toLowerCase().includes(q));
  }, [rugs, debouncedSearch]);

  const pagination = usePaginatedList(filteredRugs);

  // Build grouped view
  const groupedView = useMemo(() => {
    if (debouncedSearch) return null; // search mode: flat list

    const assigned = new Set<string>();
    const sections: { label: string; rugs: RugRow[] }[] = [];

    for (const group of pickupGroups) {
      const groupRugs = rugs.filter((r) => group.rugIds.has(r.id));
      groupRugs.forEach((r) => assigned.add(r.id));
      if (groupRugs.length > 0) {
        sections.push({ label: group.label, rugs: groupRugs });
      }
    }

    const other = rugs.filter((r) => !assigned.has(r.id));
    if (other.length > 0) {
      sections.push({ label: "Other active rugs", rugs: other });
    }

    return sections.length > 0 ? sections : null;
  }, [rugs, pickupGroups, debouncedSearch]);

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
        <p>To schedule a pickup for new rugs, use the Pickups tab.</p>
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
                <PortalRugCard key={rug.id} rug={rug} onClick={() => handleCardClick(rug)} />
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
      ) : groupedView ? (
        /* Grouped by pickup date */
        <div className="space-y-6">
          {groupedView.map((section) => (
            <div key={section.label}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {section.label}
              </h3>
              <div className="space-y-3">
                {section.rugs.map((rug) => (
                  <PortalRugCard key={rug.id} rug={rug} onClick={() => handleCardClick(rug)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Flat list with pagination */
        <>
          <div className="space-y-2">
            {pagination.items.map((rug) => (
              <PortalRugCard key={rug.id} rug={rug} onClick={() => handleCardClick(rug)} />
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
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </div>
  );
}
