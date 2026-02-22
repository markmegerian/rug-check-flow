import { useEffect, useState } from "react";
import PortalRugsTab from "@/components/portal/PortalRugsTab";
import PortalPickupsTab from "@/components/portal/PortalPickupsTab";
import PortalInvoicesTab from "@/components/portal/PortalInvoicesTab";
import PortalEstimatesTab from "@/components/portal/PortalEstimatesTab";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceUpdatesStrip } from "@/components/layout/WorkspaceUpdatesStrip";
import { usePortalClient } from "@/hooks/usePortalClient";
import { supabaseExtended } from "@/integrations/supabase/extended";

type Tab = "rugs" | "pickups" | "estimates" | "invoices";

const TABS: { key: Tab; label: string }[] = [
  { key: "rugs", label: "Rugs" },
  { key: "pickups", label: "Pickups" },
  { key: "estimates", label: "Estimates" },
  { key: "invoices", label: "Invoices" },
];

export default function WholesalePortal() {
  const [activeTab, setActiveTab] = useState<Tab>("rugs");
  const { clientId, loading: portalClientLoading } = usePortalClient();
  const [metrics, setMetrics] = useState({
    pendingApprovals: 0,
    readyRugs: 0,
    openPickupRequests: 0,
    openInvoices: 0,
    loading: true,
  });
  const activeTabLabel = TABS.find((tab) => tab.key === activeTab)?.label ?? "Rugs";

  useEffect(() => {
    let active = true;
    const loadMetrics = async () => {
      if (portalClientLoading) {
        setMetrics((prev) => ({ ...prev, loading: true }));
        return;
      }

      if (!clientId) {
        if (active) {
          setMetrics({
            pendingApprovals: 0,
            readyRugs: 0,
            openPickupRequests: 0,
            openInvoices: 0,
            loading: false,
          });
        }
        return;
      }

      const [pendingApprovalsRes, readyRugsRes, pendingPickupsRes, confirmedPickupsRes, sentInvoicesRes, overdueInvoicesRes] =
        await Promise.all([
          supabaseExtended
            .from("estimates")
            .select("id", { count: "exact", head: true })
            .eq("client_id", clientId)
            .eq("status", "sent"),
          supabaseExtended
            .from("rugs")
            .select("id", { count: "exact", head: true })
            .eq("client_id", clientId)
            .eq("status", "ready"),
          supabaseExtended
            .from("pickup_requests")
            .select("id", { count: "exact", head: true })
            .eq("client_id", clientId)
            .eq("status", "pending"),
          supabaseExtended
            .from("pickup_requests")
            .select("id", { count: "exact", head: true })
            .eq("client_id", clientId)
            .eq("status", "confirmed"),
          supabaseExtended
            .from("invoices")
            .select("id", { count: "exact", head: true })
            .eq("client_id", clientId)
            .eq("status", "sent"),
          supabaseExtended
            .from("invoices")
            .select("id", { count: "exact", head: true })
            .eq("client_id", clientId)
            .eq("status", "overdue"),
        ]);

      if (!active) return;

      setMetrics({
        pendingApprovals: pendingApprovalsRes.count ?? 0,
        readyRugs: readyRugsRes.count ?? 0,
        openPickupRequests: (pendingPickupsRes.count ?? 0) + (confirmedPickupsRes.count ?? 0),
        openInvoices: (sentInvoicesRes.count ?? 0) + (overdueInvoicesRes.count ?? 0),
        loading: false,
      });
    };

    loadMetrics();
    return () => {
      active = false;
    };
  }, [clientId, portalClientLoading]);

  return (
    <AppShell
      title="Wholesale Portal"
      subtitle={`Pacific Rug Gallery · ${activeTabLabel}`}
      contentClassName="bg-gradient-to-b from-muted/40 to-background overflow-auto"
    >
      <div className="max-w-6xl mx-auto py-5">
        <WorkspaceUpdatesStrip
          className="mx-4 sm:mx-6 shadow-sm"
          loading={metrics.loading}
          updates={[
            {
              id: "portal-pending-approvals",
              label: "Pending approvals",
              value: metrics.pendingApprovals,
              detail: "Estimates waiting for your decision",
              tone: metrics.pendingApprovals > 0 ? "warning" : "neutral",
            },
            {
              id: "portal-ready-rugs",
              label: "Ready rugs",
              value: metrics.readyRugs,
              detail: "Rugs available to include in pickup",
              tone: metrics.readyRugs > 0 ? "info" : "neutral",
            },
            {
              id: "portal-open-pickups",
              label: "Open pickup requests",
              value: metrics.openPickupRequests,
              detail: "Requests not yet assigned/completed",
              tone: metrics.openPickupRequests > 0 ? "warning" : "neutral",
            },
            {
              id: "portal-open-invoices",
              label: "Open invoices",
              value: metrics.openInvoices,
              detail: "Sent or overdue balances",
              tone: metrics.openInvoices > 0 ? "warning" : "success",
            },
          ]}
        />

        <div className="px-4 sm:px-6 mt-4">
          <nav className="flex gap-1 mb-4 p-1 rounded-xl bg-card border shadow-sm w-full sm:w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab.key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <main className="rounded-xl border border-border bg-card p-3 md:p-4 shadow-sm">
            {activeTab === "rugs" && <PortalRugsTab />}
            {activeTab === "pickups" && <PortalPickupsTab />}
            {activeTab === "estimates" && <PortalEstimatesTab />}
            {activeTab === "invoices" && <PortalInvoicesTab />}
          </main>
        </div>
      </div>
    </AppShell>
  );
}
