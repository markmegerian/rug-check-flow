import { useState } from "react";
import { ClipboardCheck, Factory, Truck, Package } from "lucide-react";
import { CheckInLayout } from "@/components/facility/CheckInLayout";
import { ProductionBoard } from "@/components/facility/ProductionBoard";
import { PendingPickupsPanel } from "@/components/facility/PendingPickupsPanel";
import { DeliveryPrepTab } from "@/components/facility/DeliveryPrepTab";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";

const TABS = [
  { id: "checkin", label: "Check-In", icon: ClipboardCheck, subtitle: "Intake and service capture" },
  { id: "production", label: "Production", icon: Factory, subtitle: "Track rugs through production stages" },
  { id: "delivery-prep", label: "Delivery Prep", icon: Package, subtitle: "Confirm rugs ready for tomorrow" },
  { id: "pickups", label: "Pickups", icon: Truck, subtitle: "Manage ready rugs and pickups" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function FacilityOps() {
  const [activeTab, setActiveTab] = useState<TabId>("checkin");
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  return (
    <AppShell
      title="Facility Operations"
      subtitle={`${activeTabMeta.label} · ${activeTabMeta.subtitle}`}
      contentClassName="overflow-hidden"
    >
      <div className="h-full flex flex-col bg-muted/20">
        <div className="flex-1 min-h-0 flex flex-col md:flex-row m-3 mt-3 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <WorkspaceTabs
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as TabId)}
            desktopWidthClassName="md:w-48"
            mobileLabelMode="always"
            className="bg-muted/30"
          />

          {/* Tab content */}
          <main className="flex-1 min-w-0 min-h-0 overflow-hidden bg-background">
            {activeTab === "checkin" && <CheckInLayout />}
            {activeTab === "production" && <ProductionBoard />}
            {activeTab === "delivery-prep" && <DeliveryPrepTab />}
            {activeTab === "pickups" && <PendingPickupsPanel />}
          </main>
        </div>
      </div>
    </AppShell>
  );
}
