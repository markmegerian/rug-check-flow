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
      contentClassName="bg-gradient-to-b from-muted/40 to-background overflow-auto"
    >
      <div className="max-w-6xl mx-auto py-5">
        <div className="px-4 sm:px-6">
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
