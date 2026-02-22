import { useState } from "react";
import PortalRugsTab from "@/components/portal/PortalRugsTab";
import PortalPickupsTab from "@/components/portal/PortalPickupsTab";
import PortalInvoicesTab from "@/components/portal/PortalInvoicesTab";
import PortalEstimatesTab from "@/components/portal/PortalEstimatesTab";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceQuickActions } from "@/components/layout/WorkspaceQuickActions";
import { ClipboardCheck, FileText, PackageSearch, Truck } from "lucide-react";

type Tab = "rugs" | "pickups" | "estimates" | "invoices";

const TABS: { key: Tab; label: string }[] = [
  { key: "rugs", label: "Rugs" },
  { key: "pickups", label: "Pickups" },
  { key: "estimates", label: "Estimates" },
  { key: "invoices", label: "Invoices" },
];

const QUICK_ACTIONS = [
  {
    id: "portal-track-rugs",
    title: "Track rugs",
    description: "Review status, services, and check-in dates for all rugs.",
    icon: PackageSearch,
    tab: "rugs",
  },
  {
    id: "portal-request-pickup",
    title: "Request pickup",
    description: "Schedule ready rugs and add any additional pickup items.",
    icon: Truck,
    tab: "pickups",
  },
  {
    id: "portal-estimates",
    title: "Approve estimates",
    description: "Review pending estimates and approve or reject quickly.",
    icon: ClipboardCheck,
    tab: "estimates",
  },
  {
    id: "portal-invoices",
    title: "Review invoices",
    description: "Check billing status and view detailed line items.",
    icon: FileText,
    tab: "invoices",
  },
] as const;

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
        <WorkspaceQuickActions
          className="rounded-2xl border border-border bg-card shadow-sm"
          actions={QUICK_ACTIONS}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />

        <div className="px-4 sm:px-6 mt-4">
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
