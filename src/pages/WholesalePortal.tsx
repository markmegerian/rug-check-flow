import { useState } from "react";
import PortalRugsTab from "@/components/portal/PortalRugsTab";
import PortalPickupsTab from "@/components/portal/PortalPickupsTab";
import PortalInvoicesTab from "@/components/portal/PortalInvoicesTab";
import PortalEstimatesTab from "@/components/portal/PortalEstimatesTab";
import { AppShell } from "@/components/layout/AppShell";

type Tab = "rugs" | "pickups" | "estimates" | "invoices";

const TABS: { key: Tab; label: string }[] = [
  { key: "rugs", label: "Rugs" },
  { key: "pickups", label: "Pickups" },
  { key: "estimates", label: "Estimates" },
  { key: "invoices", label: "Invoices" },
];

export default function WholesalePortal() {
  const [activeTab, setActiveTab] = useState<Tab>("rugs");
  const activeTabLabel = TABS.find((tab) => tab.key === activeTab)?.label ?? "Rugs";

  return (
    <AppShell
      title="Wholesale Portal"
      subtitle={`Pacific Rug Gallery · ${activeTabLabel}`}
      contentClassName="bg-muted/30 overflow-auto"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5">
        <nav className="flex gap-0 -mb-px mb-4">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <main>
          {activeTab === "rugs" && <PortalRugsTab />}
          {activeTab === "pickups" && <PortalPickupsTab />}
          {activeTab === "estimates" && <PortalEstimatesTab />}
          {activeTab === "invoices" && <PortalInvoicesTab />}
        </main>
      </div>
    </AppShell>
  );
}
