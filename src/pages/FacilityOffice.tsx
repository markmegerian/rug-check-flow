import { useEffect, useState } from "react";
import { DollarSign, FileText, Users, Truck, CalendarCheck, ClipboardCheck } from "lucide-react";
import { PricingTab } from "@/components/office/PricingTab";
import { InvoicesTab } from "@/components/office/InvoicesTab";
import { ClientsTab } from "@/components/office/ClientsTab";
import { DeliveriesTab } from "@/components/office/DeliveriesTab";
import { PickupRequestsTab } from "@/components/office/PickupRequestsTab";
import { EstimatesTab } from "@/components/office/EstimatesTab";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { WorkspaceUpdatesStrip } from "@/components/layout/WorkspaceUpdatesStrip";
import { supabaseExtended } from "@/integrations/supabase/extended";

const TABS = [
  { id: "pricing", label: "Pricing", icon: DollarSign, subtitle: "Services and rate tables" },
  { id: "invoices", label: "Invoices", icon: FileText, subtitle: "Draft, send, and settle invoices" },
  { id: "estimates", label: "Estimates", icon: ClipboardCheck, subtitle: "Create and send rug estimates" },
  { id: "clients", label: "Clients", icon: Users, subtitle: "Client accounts and portal access" },
  { id: "pickups", label: "Pickups", icon: CalendarCheck, subtitle: "Pickup request coordination" },
  { id: "deliveries", label: "Deliveries", icon: Truck, subtitle: "Route planning and truck checkout" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function FacilityOffice() {
  const [activeTab, setActiveTab] = useState<TabId>("pricing");
  const [metrics, setMetrics] = useState({
    pendingApprovals: 0,
    staleEstimates: 0,
    recentClientDecisions: 0,
    overdueInvoices: 0,
    loading: true,
  });
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  useEffect(() => {
    let active = true;
    const loadMetrics = async () => {
      const staleCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const recentCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [pendingRes, staleDraftRes, staleSentRes, approvedRes, rejectedRes, overdueRes] =
        await Promise.all([
          supabaseExtended.from("estimates").select("id", { count: "exact", head: true }).eq("status", "sent"),
          supabaseExtended
            .from("estimates")
            .select("id", { count: "exact", head: true })
            .eq("status", "draft")
            .lt("created_at", staleCutoff),
          supabaseExtended
            .from("estimates")
            .select("id", { count: "exact", head: true })
            .eq("status", "sent")
            .lt("created_at", staleCutoff),
          supabaseExtended
            .from("estimates")
            .select("id", { count: "exact", head: true })
            .eq("status", "approved")
            .gte("approved_at", recentCutoff),
          supabaseExtended
            .from("estimates")
            .select("id", { count: "exact", head: true })
            .eq("status", "rejected")
            .gte("rejected_at", recentCutoff),
          supabaseExtended.from("invoices").select("id", { count: "exact", head: true }).eq("status", "overdue"),
        ]);

      if (!active) return;

      setMetrics({
        pendingApprovals: pendingRes.count ?? 0,
        staleEstimates: (staleDraftRes.count ?? 0) + (staleSentRes.count ?? 0),
        recentClientDecisions: (approvedRes.count ?? 0) + (rejectedRes.count ?? 0),
        overdueInvoices: overdueRes.count ?? 0,
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
      title="Office Workspace"
      subtitle={`${activeTabMeta.label} · ${activeTabMeta.subtitle}`}
      contentClassName="overflow-hidden"
    >
      <div className="h-full flex flex-col bg-muted/20">
        <WorkspaceUpdatesStrip
          className="mx-3 mt-3 shadow-sm"
          loading={metrics.loading}
          updates={[
            {
              id: "office-pending-approvals",
              label: "Pending client approvals",
              value: metrics.pendingApprovals,
              detail: "Estimates waiting for portal client response",
              tone: metrics.pendingApprovals > 0 ? "warning" : "neutral",
            },
            {
              id: "office-stale-estimates",
              label: "Stale estimate work (3+ days)",
              value: metrics.staleEstimates,
              detail: "Draft/sent estimates needing follow-up",
              tone: metrics.staleEstimates > 0 ? "danger" : "success",
            },
            {
              id: "office-client-decisions",
              label: "Client decisions (24h)",
              value: metrics.recentClientDecisions,
              detail: "Approved or rejected in the portal",
              tone: metrics.recentClientDecisions > 0 ? "info" : "neutral",
            },
            {
              id: "office-overdue-invoices",
              label: "Overdue invoices",
              value: metrics.overdueInvoices,
              detail: "Accounts requiring collection outreach",
              tone: metrics.overdueInvoices > 0 ? "warning" : "neutral",
            },
          ]}
        />

        <div className="flex-1 min-h-0 flex flex-col md:flex-row m-3 mt-2 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <WorkspaceTabs
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            desktopWidthClassName="md:w-52"
            mobileLabelMode="desktop-only"
            className="bg-muted/30"
          />

          <main className="flex-1 min-w-0 overflow-hidden bg-background">
            {activeTab === "pricing" && <PricingTab />}
            {activeTab === "invoices" && <InvoicesTab />}
            {activeTab === "estimates" && <EstimatesTab />}
            {activeTab === "clients" && <ClientsTab />}
            {activeTab === "pickups" && <PickupRequestsTab />}
            {activeTab === "deliveries" && <DeliveriesTab />}
          </main>
        </div>
      </div>
    </AppShell>
  );
}
