import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type PortalStatus = "in_progress" | "ready" | "delivered";
type Filter = "all" | PortalStatus;

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

const mapPortalStatus = (status: Tables<"rugs">["status"]): PortalStatus => {
  if (status === "ready") return "ready";
  if (status === "picked_up") return "delivered";
  return "in_progress";
};

export default function PortalRugsTab() {
  const { toast } = useToast();
  const [rugs, setRugs] = useState<PortalRug[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchRugs = useCallback(async () => {
    setLoading(true);
    setAccessError(null);

    const { data: authData } = await supabase.auth.getUser();
    const email = authData.user?.email?.toLowerCase();
    if (!email) {
      setAccessError("Portal account required. Please sign in again.");
      setLoading(false);
      return;
    }

    const { data: portalUser, error: portalError } = await supabase
      .from("portal_users")
      .select("client_id")
      .eq("email", email)
      .eq("status", "active")
      .maybeSingle();

    if (portalError) {
      toast({ title: "Failed to load portal profile", description: portalError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    if (!portalUser?.client_id) {
      setAccessError("No active portal access was found for your account.");
      setLoading(false);
      return;
    }

    const { data: rugRows, error: rugsError } = await supabase
      .from("rugs")
      .select("id, tag, description, size_length, size_width, services, status, checked_in_at")
      .eq("client_id", portalUser.client_id)
      .order("checked_in_at", { ascending: false });

    if (rugsError) {
      toast({ title: "Failed to load rugs", description: rugsError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const mapped = (rugRows ?? []).map((rug) => ({
      id: rug.id,
      rugNumber: rug.tag,
      rugType: rug.description || "Rug",
      length: Number(rug.size_length ?? 0),
      width: Number(rug.size_width ?? 0),
      services: rug.services ?? [],
      status: mapPortalStatus(rug.status),
      checkedInDate: rug.checked_in_at,
    }));

    setRugs(mapped);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchRugs();
  }, [fetchRugs]);

  const counts = {
    total: rugs.length,
    in_progress: rugs.filter((r) => r.status === "in_progress").length,
    ready: rugs.filter((r) => r.status === "ready").length,
    delivered: rugs.filter((r) => r.status === "delivered").length,
  };

  const filtered = useMemo(
    () => (filter === "all" ? rugs : rugs.filter((r) => r.status === filter)),
    [filter, rugs]
  );

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.total },
    { key: "in_progress", label: "In Progress", count: counts.in_progress },
    { key: "ready", label: "Ready", count: counts.ready },
    { key: "delivered", label: "Delivered", count: counts.delivered },
  ];

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading rugs...</p>;
  }

  if (accessError) {
    return <p className="text-sm text-muted-foreground">{accessError}</p>;
  }

  return (
    <div className="space-y-4">
      {/* Filter pills */}
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

      {/* Rug list */}
      <div className="rounded-lg border bg-background divide-y">
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-sm text-muted-foreground">No rugs found.</div>
        )}
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
                    <p>{rug.services.length > 0 ? rug.services.join(", ") : "—"}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
