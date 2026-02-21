import { useState } from "react";
import { DollarSign, FileText, Users, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PricingTab } from "@/components/office/PricingTab";
import { InvoicesTab } from "@/components/office/InvoicesTab";
import { ClientsTab } from "@/components/office/ClientsTab";
import { DeliveriesTab } from "@/components/office/DeliveriesTab";

const TABS = [
  { id: "pricing", label: "Pricing", icon: DollarSign },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "clients", label: "Clients", icon: Users },
  { id: "deliveries", label: "Deliveries", icon: Truck },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function FacilityOffice() {
  const [activeTab, setActiveTab] = useState<TabId>("pricing");

  return (
    <div className="h-screen flex bg-background">
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
        {activeTab === "clients" && <ClientsTab />}
        {activeTab === "deliveries" && <DeliveriesTab />}
      </main>
    </div>
  );
}
