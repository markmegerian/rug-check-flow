import { useEffect, useMemo, useState } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { usePortalClient } from "@/hooks/usePortalClient";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";

type PortalStatus = "in_progress" | "ready" | "delivered";
type Filter = "all" | PortalStatus;
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
};

type PortalRug = {
  id: string;
  rugNumber: string;
  rugType: string;
  services: string[];
  status: PortalStatus;
  length: number;
  width: number;
  checkedInDate: string;
};

const STATUS_LABELS: Record<PortalStatus, string> = {
  in_progress: "In Progress",
  ready: "Ready",
  delivered: "Delivered",
};

const STATUS_VARIANTS: Record<PortalStatus, "default" | "secondary" | "outline"> = {
  in_progress: "default",
  ready: "secondary",
  delivered: "outline",
};

const mapRugStatus = (status: RugStatus): PortalStatus => {
  if (status === "ready") return "ready";
  if (status === "picked_up") return "delivered";
  return "in_progress";
};

export default function PortalRugsTab() {
  const { toast } = useToast();
  const { clientId, loading: portalClientLoading, errorMessage } = usePortalClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rugs, setRugs] = useState<PortalRug[]>([]);

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
        .select("id, tag, description, services, size_length, size_width, checked_in_at, status")
        .eq("client_id", clientId)
        .order("checked_in_at", { ascending: false })
        .limit(250)
        .returns<RugRow[]>();

      if (error) {
        toast({ title: "Failed to load rugs", description: error.message, variant: "destructive" });
        setRugs([]); setLoading(false); return;
      }

      setRugs((data ?? []).map((rug) => ({
        id: rug.id,
        rugNumber: rug.tag,
        rugType: rug.description || "Rug",
        services: rug.services ?? [],
        status: mapRugStatus(rug.status),
        length: Number(rug.size_length ?? 0),
        width: Number(rug.size_width ?? 0),
        checkedInDate: rug.checked_in_at,
      })));
      setLoading(false);
    };

    loadRugs();
  }, [clientId, errorMessage, portalClientLoading, toast]);

  const counts = useMemo(() => ({
    total: rugs.length,
    in_progress: rugs.filter((r) => r.status === "in_progress").length,
    ready: rugs.filter((r) => r.status === "ready").length,
    delivered: rugs.filter((r) => r.status === "delivered").length,
  }), [rugs]);

  const filtered = filter === "all" ? rugs : rugs.filter((r) => r.status === filter);
  const pagination = usePaginatedList(filtered);
  const { resetPage } = pagination;
  useEffect(() => { resetPage(); }, [filter, resetPage]);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.total },
    { key: "in_progress", label: "In Progress", count: counts.in_progress },
    { key: "ready", label: "Ready", count: counts.ready },
    { key: "delivered", label: "Delivered", count: counts.delivered },
  ];

  if (portalClientLoading || loading) {
    return <div className="text-sm text-muted-foreground">Loading rugs…</div>;
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f.key
                ? "bg-foreground text-background"
                : "bg-background border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label} · {f.count}
          </button>
        ))}
      </div>

      <div className="rounded-lg border bg-background divide-y">
        {pagination.items.map((rug) => {
          const isExpanded = expandedRow === rug.id;
          return (
            <div key={rug.id}>
              <button
                onClick={() => setExpandedRow(isExpanded ? null : rug.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                <span className="text-muted-foreground">
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
                <span className="text-sm font-medium w-20 shrink-0">{rug.rugNumber}</span>
                <span className="text-sm text-muted-foreground w-20 shrink-0">{rug.rugType}</span>
                <span className="text-sm text-muted-foreground flex-1 truncate hidden sm:block">
                  {rug.services.join(", ")}
                </span>
                <Badge variant={STATUS_VARIANTS[rug.status]} className="text-[11px] shrink-0">
                  {STATUS_LABELS[rug.status]}
                </Badge>
              </button>
              {isExpanded && (
                <div className="px-4 pb-3 pl-12 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Size</span>
                    <p>{rug.length}' × {rug.width}'</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Checked in</span>
                    <p>{new Date(rug.checkedInDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-muted-foreground text-xs">Services</span>
                    <p>{rug.services.join(", ")}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
    </div>
  );
}
