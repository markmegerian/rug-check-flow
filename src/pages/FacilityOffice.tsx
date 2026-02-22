import { useState } from "react";
import { DollarSign, FileText, Users, Truck, CalendarCheck, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PricingTab } from "@/components/office/PricingTab";
import { InvoicesTab } from "@/components/office/InvoicesTab";
import { ClientsTab } from "@/components/office/ClientsTab";
import { DeliveriesTab } from "@/components/office/DeliveriesTab";
import { PickupRequestsTab } from "@/components/office/PickupRequestsTab";
import { EstimatesTab } from "@/components/office/EstimatesTab";
import { AppShell } from "@/components/layout/AppShell";

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
      <div className="h-full flex bg-background">
        <nav className="w-16 md:w-48 border-r border-border bg-card/60 backdrop-blur-sm flex flex-col py-2 shrink-0">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 md:px-4 text-sm font-medium transition-colors text-left",
                  active
                    ? "bg-background text-foreground shadow-sm border-r-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="hidden md:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="flex-1 min-w-0 overflow-hidden">
          {activeTab === "pricing" && <PricingTab />}
          {activeTab === "invoices" && <InvoicesTab />}
          {activeTab === "estimates" && <EstimatesTab />}
          {activeTab === "clients" && <ClientsTab />}
          {activeTab === "pickups" && <PickupRequestsTab />}
          {activeTab === "deliveries" && <DeliveriesTab />}
        </main>
      </div>
    </AppShell>
  );
}
