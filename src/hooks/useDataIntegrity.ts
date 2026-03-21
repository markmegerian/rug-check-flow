import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";

export type IntegrityIssue = {
  id: string;
  category: "ghost_rug" | "orphan_invoice" | "stale_delivery" | "orphan_estimate";
  severity: "warning" | "critical";
  title: string;
  description: string;
  count: number;
  href?: string;
};

async function checkDataIntegrity(): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];
  const nowMs = Date.now();
  const fourteenDaysAgo = new Date(nowMs - 14 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Ghost rugs: stuck in checked_in or in_production for >14 days
  const { count: ghostCheckedIn } = await supabase
    .from("rugs")
    .select("id", { count: "exact", head: true })
    .eq("status", "checked_in")
    .lte("checked_in_at", fourteenDaysAgo);

  const { count: ghostInProduction } = await supabase
    .from("rugs")
    .select("id", { count: "exact", head: true })
    .eq("status", "in_production")
    .lte("checked_in_at", fourteenDaysAgo);

  const ghostTotal = (ghostCheckedIn ?? 0) + (ghostInProduction ?? 0);
  if (ghostTotal > 0) {
    issues.push({
      id: "ghost-rugs",
      category: "ghost_rug",
      severity: ghostTotal > 5 ? "critical" : "warning",
      title: "Ghost rugs detected",
      description: `${ghostTotal} rug(s) stuck in processing for over 14 days. These may be forgotten or need manual status updates.`,
      count: ghostTotal,
      href: "/facility/ops?tab=production",
    });
  }

  // Stale "ready" rugs: ready for pickup but no activity for >7 days
  const { count: staleReady } = await supabase
    .from("rugs")
    .select("id", { count: "exact", head: true })
    .eq("status", "ready")
    .lte("checked_in_at", sevenDaysAgo);

  if ((staleReady ?? 0) > 0) {
    issues.push({
      id: "stale-ready",
      category: "stale_delivery",
      severity: "warning",
      title: "Rugs awaiting pickup too long",
      description: `${staleReady} rug(s) have been "ready" for over 7 days without being picked up or delivered.`,
      count: staleReady ?? 0,
      href: "/facility/ops?tab=pickups",
    });
  }

  // Overdue invoices without any follow-up (status=overdue, no recent communication)
  const { count: overdueNoFollowUp } = await supabaseExtended
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("status", "overdue");

  if ((overdueNoFollowUp ?? 0) > 10) {
    issues.push({
      id: "mass-overdue",
      category: "orphan_invoice",
      severity: "critical",
      title: "High volume of overdue invoices",
      description: `${overdueNoFollowUp} invoices are overdue. Consider bulk collections follow-up.`,
      count: overdueNoFollowUp ?? 0,
      href: "/facility/office?tab=invoices&status=overdue",
    });
  }

  // Stale estimates: sent but no client response for >14 days
  const { count: staleEstimates } = await supabaseExtended
    .from("estimates")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .lte("created_at", fourteenDaysAgo);

  if ((staleEstimates ?? 0) > 0) {
    issues.push({
      id: "stale-estimates-14d",
      category: "orphan_estimate",
      severity: "warning",
      title: "Abandoned estimates",
      description: `${staleEstimates} estimate(s) sent over 14 days ago with no client response. Consider following up or closing.`,
      count: staleEstimates ?? 0,
      href: "/facility/office?tab=estimates",
    });
  }

  return issues;
}

export function useDataIntegrity() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["data-integrity"],
    queryFn: checkDataIntegrity,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["data-integrity"] });
  }, [queryClient]);

  return {
    issues: data ?? [],
    loading: isLoading,
    error: error?.message ?? null,
    refresh,
  };
}
