import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePortalClient } from "@/hooks/usePortalClient";

type PortalStatus = "in_progress" | "ready" | "delivered";

type PortalRug = {
  id: string;
  rugNumber: string;
  rugType: string;
  length: number;
  width: number;
  services: string[];
  status: PortalStatus;
  checkedInDate: string;
};

type RugLookup = {
  id: string;
  tag: string;
  description: string;
  size_length: number | null;
  size_width: number | null;
  services: string[];
  status: "checked_in" | "in_production" | "ready" | "picked_up";
  checked_in_at: string;
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

type Filter = "all" | PortalStatus;

const mapStatus = (status: RugLookup["status"]): PortalStatus => {
  if (status === "ready") return "ready";
  if (status === "picked_up") return "delivered";
  return "in_progress";
};

export default function PortalRugsTab() {
  const { toast } = useToast();
  const { clientId, loading: portalLoading, error: portalError } = usePortalClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [rugs, setRugs] = useState<PortalRug[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (portalError) {
        toast({ title: "No portal access", description: portalError, variant: "destructive" });
        setRugs([]);
        return;
      }

      if (!clientId) return;
      setLoading(true);

      const { data, error } = await supabase
        .from("rugs")
        .select("id, tag, description, size_length, size_width, services, status, checked_in_at")
        .eq("client_id", clientId)
        .order("checked_in_at", { ascending: false })
        .limit(300)
        .returns<RugLookup[]>();

      if (error) {
        toast({ title: "Failed to load rugs", description: error.message, variant: "destructive" });
        setRugs([]);
        setLoading(false);
        return;
      }

      setRugs((data ?? []).map((rug) => ({
        id: rug.id,
        rugNumber: rug.tag,
        rugType: rug.description || "Rug",
        length: Number(rug.size_length ?? 0),
        width: Number(rug.size_width ?? 0),
        services: rug.services ?? [],
        status: mapStatus(rug.status),
        checkedInDate: rug.checked_in_at,
      })));
      setLoading(false);
    };

    load();
  }, [clientId, portalError, toast]);

  const counts = {
    total: rugs.length,
    in_progress: rugs.filter((r) => r.status === "in_progress").length,
    ready: rugs.filter((r) => r.status === "ready").length,
    delivered: rugs.filter((r) => r.status === "delivered").length,
  };

  const filtered = filter === "all" ? rugs : rugs.filter((r) => r.status === filter);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.total },
    { key: "in_progress", label: "In Progress", count: counts.in_progress },
    { key: "ready", label: "Ready", count: counts.ready },
    { key: "delivered", label: "Delivered", count: counts.delivered },
  ];

  const emptyState = useMemo(() => !loading && !portalLoading && filtered.length === 0, [filtered.length, loading, portalLoading]);

  if (loading || portalLoading) {
    return <div className="text-sm text-muted-foreground">Loading rugs…</div>;
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

      {emptyState ? (
        <div className="text-sm text-muted-foreground">No rugs available yet.</div>
      ) : (
        <div className="rounded-lg border bg-background divide-y">
          {filtered.map((rug) => {
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
      )}
    </div>
  );
}
