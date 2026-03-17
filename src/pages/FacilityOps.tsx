import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardCheck, Factory, Truck, Package } from "lucide-react";
import { CheckInLayout } from "@/components/facility/CheckInLayout";
import { ProductionBoard } from "@/components/facility/ProductionBoard";
import { PendingPickupsPanel } from "@/components/facility/PendingPickupsPanel";
import { DeliveryPrepTab } from "@/components/facility/DeliveryPrepTab";
import { RugSearchDialog } from "@/components/facility/RugSearchDialog";
import { RugDetailSheet } from "@/components/facility/RugDetailSheet";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";

const TABS = [
  { id: "checkin", label: "Check-In", icon: ClipboardCheck },
  { id: "production", label: "Production", icon: Factory },
  { id: "delivery-prep", label: "Delivery Prep", icon: Package },
  { id: "pickups", label: "Pickups", icon: Truck },
] as const;

type TabId = (typeof TABS)[number]["id"];
const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

export default function FacilityOps() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab: TabId = requestedTab && TAB_IDS.has(requestedTab) ? (requestedTab as TabId) : "checkin";
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailRugId, setDetailRugId] = useState<string | null>(null);
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const handleRugSelect = useCallback((rugId: string) => setDetailRugId(rugId), []);

  const handleTabChange = (tabId: TabId) => {
    setActiveTab(tabId);
    const next = new URLSearchParams(searchParams);
    next.set("tab", tabId);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (requestedTab && TAB_IDS.has(requestedTab)) {
      setActiveTab((cur) => (cur === requestedTab ? cur : (requestedTab as TabId)));
    }
  }, [requestedTab]);

  return (
    <AppShell
      title="Facility Ops"
      subtitle={activeTabMeta.label}
      contentClassName="overflow-hidden flex flex-col"
      statusBar={<WorkspaceStatusBar />}
      onSearchOpen={() => setSearchOpen(true)}
    >
      <WorkspaceTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(tabId) => handleTabChange(tabId as TabId)}
      />

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "checkin" && <CheckInLayout />}
        {activeTab === "production" && <ProductionBoard />}
        {activeTab === "delivery-prep" && <DeliveryPrepTab />}
        {activeTab === "pickups" && <PendingPickupsPanel />}
      </div>

      <RugSearchDialog open={searchOpen} onOpenChange={setSearchOpen} onSelectRug={handleRugSelect} />
      <RugDetailSheet rugId={detailRugId} open={Boolean(detailRugId)} onOpenChange={(open) => { if (!open) setDetailRugId(null); }} />
    </AppShell>
  );
}
