import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DollarSign, FileText, Users, Truck, CalendarCheck, ClipboardCheck } from "lucide-react";
import { PricingTab } from "@/components/office/PricingTab";
import { InvoicesTab } from "@/components/office/InvoicesTab";
import { ClientsTab } from "@/components/office/ClientsTab";
import { DeliveriesTab } from "@/components/office/DeliveriesTab";
import { PickupRequestsTab } from "@/components/office/PickupRequestsTab";
import { EstimatesTab } from "@/components/office/EstimatesTab";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";
import { ClientPricingDialog } from "@/components/pricing/ClientPricingDialog";
import { useAuth } from "@/contexts/AuthContext";

const BASE_TABS = [
  { id: "invoices", label: "Invoices", icon: FileText, subtitle: "Draft, send, and settle invoices" },
  { id: "estimates", label: "Estimates", icon: ClipboardCheck, subtitle: "Create and send rug estimates" },
  { id: "clients", label: "Clients", icon: Users, subtitle: "Client accounts and portal access" },
  { id: "pickups", label: "Pickups", icon: CalendarCheck, subtitle: "Pickup request coordination" },
  { id: "deliveries", label: "Deliveries", icon: Truck, subtitle: "Route planning and truck checkout" },
] as const;

const ADMIN_PRICING_TAB = { id: "pricing", label: "Pricing", icon: DollarSign, subtitle: "Manage service rates" } as const;

type TabId = "pricing" | (typeof BASE_TABS)[number]["id"];

export default function FacilityOffice() {
  const { hasRole } = useAuth();
  const canManagePricing = hasRole("admin");
  const tabs = useMemo(() => (canManagePricing ? [ADMIN_PRICING_TAB, ...BASE_TABS] : [...BASE_TABS]), [canManagePricing]);
  const tabIds = useMemo(() => new Set<string>(tabs.map((tab) => tab.id)), [tabs]);

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab: TabId = requestedTab !== null && tabIds.has(requestedTab) ? (requestedTab as TabId) : "invoices";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const handleTabChange = (nextTab: TabId) => {
    setActiveTab(nextTab);
    const nextSearch = new URLSearchParams(searchParams);
    nextSearch.set("tab", nextTab);
    setSearchParams(nextSearch, { replace: true });
  };

  useEffect(() => {
    if (requestedTab && tabIds.has(requestedTab)) {
      setActiveTab((currentTab) => (currentTab === requestedTab ? currentTab : (requestedTab as TabId)));
    }
  }, [requestedTab, tabIds]);

  const activeTabMeta = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <AppShell
      title="Office Workspace"
      subtitle={`${activeTabMeta.label} · ${activeTabMeta.subtitle}`}
      contentClassName="overflow-hidden"
      statusBar={<WorkspaceStatusBar />}
      actions={<ClientPricingDialog triggerLabel="Price Lookup" />}
    >
      <div className="h-full flex flex-col bg-muted/20">
        <div className="flex-1 min-h-0 flex flex-col md:flex-row m-3 mt-3 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <WorkspaceTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(tabId) => handleTabChange(tabId as TabId)}
            desktopWidthClassName="md:w-52"
            mobileLabelMode="desktop-only"
            className="bg-muted/30"
          />

          <main className="flex-1 min-w-0 overflow-hidden bg-background">
            {activeTab === "pricing" && canManagePricing && <PricingTab />}
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
