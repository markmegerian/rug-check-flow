import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ClipboardCheck,
  Factory,
  Truck,
  Package,
  DollarSign,
  FileText,
  Users,
  Camera,
  Map,
  Receipt,
} from "lucide-react";
import { CheckInLayout } from "@/components/facility/CheckInLayout";
import { ProductionBoard } from "@/components/facility/ProductionBoard";
import { InvoiceGeneratorPanel } from "@/components/facility/InvoiceGeneratorPanel";
import { DeliveryPrepTab } from "@/components/facility/DeliveryPrepTab";
import { PricingTab } from "@/components/office/PricingTab";
import { InvoicesTab } from "@/components/office/InvoicesTab";
import { ClientsTab } from "@/components/office/ClientsTab";
import { DeliveriesTab } from "@/components/office/DeliveriesTab";
import { DeliveryProofBoard } from "@/components/office/DeliveryProofBoard";
import { RouteBuilder } from "@/components/office/RouteBuilder";
import { EstimatesTab } from "@/components/office/EstimatesTab";
import { RugSearchDialog } from "@/components/facility/RugSearchDialog";
import { RugDetailSheet } from "@/components/facility/RugDetailSheet";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceTabs, type WorkspaceTabGroup } from "@/components/layout/WorkspaceTabs";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";
import { ClientPricingDialog } from "@/components/pricing/ClientPricingDialog";
import { useAuth } from "@/contexts/AuthContext";

const FLOOR_TABS = [
  { id: "checkin", label: "Check-In", icon: ClipboardCheck },
  { id: "production", label: "Production", icon: Factory },
  { id: "delivery-prep", label: "Delivery Prep", icon: Package },
  { id: "invoice-generator", label: "Invoice", icon: Receipt },
] as const;

const BUSINESS_TABS_BASE = [
  { id: "accounts-receivable", label: "Accounts Receivable", icon: FileText },
  { id: "estimates", label: "Estimates", icon: ClipboardCheck },
  { id: "clients", label: "Clients", icon: Users },
  { id: "deliveries", label: "Deliveries", icon: Truck },
  { id: "routes", label: "Routes", icon: Map },
  { id: "proofs", label: "Proofs", icon: Camera },
] as const;

const PRICING_TAB = { id: "pricing", label: "Pricing", icon: DollarSign } as const;

type FloorTabId = (typeof FLOOR_TABS)[number]["id"];
type BusinessTabId = "pricing" | (typeof BUSINESS_TABS_BASE)[number]["id"];
type TabId = FloorTabId | BusinessTabId;

export default function Operations() {
  const { hasRole } = useAuth();
  const canManagePricing = hasRole("admin");
  const isOffice = hasRole("admin") || hasRole("office");

  const businessTabs = useMemo(
    () => (canManagePricing ? [PRICING_TAB, ...BUSINESS_TABS_BASE] : [...BUSINESS_TABS_BASE]),
    [canManagePricing],
  );

  const groups = useMemo(() => {
    const g: WorkspaceTabGroup<TabId>[] = [{ label: "Floor", tabs: FLOOR_TABS }];
    if (isOffice) {
      g.push({ label: "Business", tabs: businessTabs });
    }
    return g;
  }, [isOffice, businessTabs]);

  const allTabIds = useMemo(
    () => new Set<string>(groups.flatMap((g) => g.tabs.map((t) => t.id))),
    [groups],
  );

  const defaultTab: TabId = "checkin";

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab: TabId =
    requestedTab && allTabIds.has(requestedTab) ? (requestedTab as TabId) : defaultTab;
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const [searchOpen, setSearchOpen] = useState(false);
  const [detailRugId, setDetailRugId] = useState<string | null>(null);
  const handleRugSelect = useCallback((rugId: string) => setDetailRugId(rugId), []);

  const handleTabChange = (nextTab: TabId) => {
    setActiveTab(nextTab);
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (requestedTab && allTabIds.has(requestedTab)) {
      setActiveTab((cur) => (cur === requestedTab ? cur : (requestedTab as TabId)));
    }
  }, [requestedTab, allTabIds]);

  const activeLabel = useMemo(() => {
    for (const g of groups) {
      const found = g.tabs.find((t) => t.id === activeTab);
      if (found) return found.label;
    }
    return "";
  }, [groups, activeTab]);

  return (
    <AppShell
      title="Operations"
      subtitle={activeLabel}
      contentClassName="overflow-hidden flex flex-col"
      statusBar={<WorkspaceStatusBar />}
      onSearchOpen={() => setSearchOpen(true)}
      actions={isOffice ? <ClientPricingDialog triggerLabel="Price Lookup" /> : undefined}
    >
      <WorkspaceTabs
        tabs={[]}
        groups={groups}
        activeTab={activeTab}
        onTabChange={(tabId) => handleTabChange(tabId as TabId)}
      />

      <div className="flex-1 min-h-0 min-w-0 overflow-hidden rounded-t-3xl border border-border/70 bg-white/70 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)] backdrop-blur-sm md:mx-4">
        {/* Floor tabs */}
        {activeTab === "checkin" && <CheckInLayout />}
        {activeTab === "production" && <ProductionBoard />}
        {activeTab === "delivery-prep" && <DeliveryPrepTab />}
        {activeTab === "invoice-generator" && <InvoiceGeneratorPanel />}

        {/* Business tabs */}
        {activeTab === "pricing" && canManagePricing && <PricingTab />}
        {activeTab === "accounts-receivable" && <InvoicesTab />}
        {activeTab === "estimates" && <EstimatesTab />}
        {activeTab === "clients" && <ClientsTab />}
        {activeTab === "deliveries" && <DeliveriesTab />}
        {activeTab === "routes" && <RouteBuilder />}
        {activeTab === "proofs" && <DeliveryProofBoard />}
      </div>

      <RugSearchDialog open={searchOpen} onOpenChange={setSearchOpen} onSelectRug={handleRugSelect} />
      <RugDetailSheet rugId={detailRugId} open={Boolean(detailRugId)} onOpenChange={(open) => { if (!open) setDetailRugId(null); }} />
    </AppShell>
  );
}
