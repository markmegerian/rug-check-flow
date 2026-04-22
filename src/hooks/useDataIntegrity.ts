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

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  if (maybe.code === "PGRST205" || maybe.code === "42P01") return true;
  return (maybe.message ?? "").toLowerCase().includes("could not find the table");
}

async function safeCount(
  query: Promise<{ count: number | null; error: { message: string } | null }>
): Promise<number | null> {
  try {
    const { count, error } = await query;
    if (error) {
      if (isMissingTableError(error)) return null;
      throw error;
    }
    return count ?? 0;
  } catch {
    return null;
  }
}

async function checkDataIntegrity(): Promise<IntegrityIssue[]> {
  const issues: IntegrityIssue[] = [];
  const nowMs = Date.now();
  const fourteenDaysAgo = new Date(nowMs - 14 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Run all checks in parallel, gracefully handling missing tables
  const [ghostCheckedIn, ghostInProduction, staleReady, overdueCount, staleEstimates] = await Promise.all([
    safeCount(
      supabase.from("rugs").select("id", { count: "exact", head: true })
        .eq("status", "checked_in").lte("checked_in_at", fourteenDaysAgo)
    ),
    safeCount(
      supabase.from("rugs").select("id", { count: "exact", head: true })
        .eq("status", "in_production").lte("checked_in_at", fourteenDaysAgo)
    ),
    safeCount(
      supabase.from("rugs").select("id", { count: "exact", head: true })
        .eq("status", "ready").lte("checked_in_at", thirtyDaysAgo)
    ),
    safeCount(
      supabaseExtended.from("invoices").select("id", { count: "exact", head: true })
        .eq("status", "overdue")
    ),
    safeCount(
      supabaseExtended.from("estimates").select("id", { count: "exact", head: true })
        .eq("status", "sent").lte("created_at", fourteenDaysAgo)
    ),
  ]);

  // Ghost rugs: stuck in checked_in or in_production for >14 days
  if (ghostCheckedIn !== null && ghostInProduction !== null) {
    const ghostTotal = ghostCheckedIn + ghostInProduction;
    if (ghostTotal > 0) {
      issues.push({
        id: "ghost-rugs",
        category: "ghost_rug",
        severity: ghostTotal > 5 ? "critical" : "warning",
        title: "Ghost rugs detected",
        description: `${ghostTotal} rug(s) stuck in processing for over 14 days without progress.`,
        count: ghostTotal,
        href: "/ops?tab=delivery-prep",
      });
    }
  }

  // Stale "ready" rugs: been ready over 30 days (using checked_in_at as proxy —
  // a rug checked in 30+ days ago and still "ready" is likely forgotten)
  if (staleReady !== null && staleReady > 0) {
    issues.push({
      id: "stale-ready",
      category: "stale_delivery",
      severity: "warning",
      title: "Rugs awaiting pickup too long",
      description: `${staleReady} rug(s) have been "ready" and checked in over 30 days ago without being picked up.`,
      count: staleReady,
    });
  }

  // Mass overdue invoices
  if (overdueCount !== null && overdueCount > 10) {
    issues.push({
      id: "mass-overdue",
      category: "orphan_invoice",
      severity: "critical",
      title: "High volume of overdue invoices",
      description: `${overdueCount} invoices are overdue. Consider bulk collections follow-up.`,
      count: overdueCount,
      href: "/ops?tab=accounts-receivable&status=overdue",
    });
  }

  // Stale estimates
  if (staleEstimates !== null && staleEstimates > 0) {
    issues.push({
      id: "stale-estimates-14d",
      category: "orphan_estimate",
      severity: "warning",
      title: "Abandoned estimates",
      description: `${staleEstimates} estimate(s) sent over 14 days ago with no client response.`,
      count: staleEstimates,
      href: "/ops?tab=estimates",
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
    error: error instanceof Error ? error.message : null,
    refresh,
  };
}
