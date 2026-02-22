import { useState } from "react";
import { DollarSign, FileText, Users, Truck, CalendarCheck, ClipboardCheck } from "lucide-react";
import { PricingTab } from "@/components/office/PricingTab";
import { InvoicesTab } from "@/components/office/InvoicesTab";
import { ClientsTab } from "@/components/office/ClientsTab";
import { DeliveriesTab } from "@/components/office/DeliveriesTab";
import { PickupRequestsTab } from "@/components/office/PickupRequestsTab";
import { EstimatesTab } from "@/components/office/EstimatesTab";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";

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
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  return (
    <AppShell
      title="Office Workspace"
      subtitle={`${activeTabMeta.label} · ${activeTabMeta.subtitle}`}
      contentClassName="overflow-hidden"
    >
      <div className="h-full flex flex-col bg-muted/20">
        <div className="flex-1 min-h-0 flex flex-col md:flex-row m-3 mt-3 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
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
