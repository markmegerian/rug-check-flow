import { useEffect, useState } from "react";
import { ClipboardCheck, Factory, Truck } from "lucide-react";
import { CheckInLayout } from "@/components/facility/CheckInLayout";
import { ProductionBoard } from "@/components/facility/ProductionBoard";
import { PendingPickupsPanel } from "@/components/facility/PendingPickupsPanel";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { WorkspaceUpdatesStrip } from "@/components/layout/WorkspaceUpdatesStrip";
import { supabaseExtended } from "@/integrations/supabase/extended";

const TABS = [
  { id: "checkin", label: "Check-In", icon: ClipboardCheck, subtitle: "Intake and service capture" },
  { id: "production", label: "Production", icon: Factory, subtitle: "Track rugs through production stages" },
  { id: "pickups", label: "Pickups", icon: Truck, subtitle: "Manage ready rugs and pickups" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function FacilityOps() {
  const [activeTab, setActiveTab] = useState<TabId>("checkin");
  const [metrics, setMetrics] = useState({
    readyRugs: 0,
    stalledProduction: 0,
    pendingPickups: 0,
    checkedInToday: 0,
    loading: true,
  });
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  useEffect(() => {
    let active = true;
    const loadMetrics = async () => {
      const staleCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);

      const [readyRes, stalledRes, pendingRes, confirmedRes, checkinRes] = await Promise.all([
        supabaseExtended.from("rugs").select("id", { count: "exact", head: true }).eq("status", "ready"),
        supabaseExtended
          .from("rugs")
          .select("id", { count: "exact", head: true })
          .eq("status", "in_production")
          .lt("checked_in_at", staleCutoff),
        supabaseExtended.from("pickup_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabaseExtended.from("pickup_requests").select("id", { count: "exact", head: true }).eq("status", "confirmed"),
        supabaseExtended
          .from("rugs")
          .select("id", { count: "exact", head: true })
          .gte("checked_in_at", dayStart.toISOString()),
      ]);

      if (!active) return;

      setMetrics({
        readyRugs: readyRes.count ?? 0,
        stalledProduction: stalledRes.count ?? 0,
        pendingPickups: (pendingRes.count ?? 0) + (confirmedRes.count ?? 0),
        checkedInToday: checkinRes.count ?? 0,
        loading: false,
      });
    };

    loadMetrics();
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppShell
      title="Facility Operations"
      subtitle={`${activeTabMeta.label} · ${activeTabMeta.subtitle}`}
      contentClassName="overflow-hidden"
    >
      <div className="h-full flex flex-col bg-muted/20">
        <WorkspaceUpdatesStrip
          className="mx-3 mt-3 shadow-sm"
          loading={metrics.loading}
          updates={[
            {
              id: "ops-ready-rugs",
              label: "Ready rugs",
              value: metrics.readyRugs,
              detail: "Completed and awaiting pickup scheduling",
              tone: metrics.readyRugs > 0 ? "warning" : "neutral",
            },
            {
              id: "ops-stalled-production",
              label: "Stalled 3+ days",
              value: metrics.stalledProduction,
              detail: "In production with no recent movement",
              tone: metrics.stalledProduction > 0 ? "danger" : "success",
            },
            {
              id: "ops-pending-pickups",
              label: "Pending pickups",
              value: metrics.pendingPickups,
              detail: "Portal requests waiting office/dispatch action",
              tone: metrics.pendingPickups > 0 ? "warning" : "neutral",
            },
            {
              id: "ops-checkins-today",
              label: "Checked in today",
              value: metrics.checkedInToday,
              detail: "Rugs received since start of day",
              tone: "info",
            },
          ]}
        />

        <div className="flex-1 min-h-0 flex flex-col md:flex-row m-3 mt-2 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <WorkspaceTabs
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            desktopWidthClassName="md:w-48"
            mobileLabelMode="always"
            className="bg-muted/30"
          />

          {/* Tab content */}
          <main className="flex-1 min-w-0 min-h-0 overflow-hidden bg-background">
            {activeTab === "checkin" && <CheckInLayout />}
            {activeTab === "production" && <ProductionBoard />}
            {activeTab === "pickups" && <PendingPickupsPanel />}
          </main>
        </div>
      </div>
    </AppShell>
  );
}
