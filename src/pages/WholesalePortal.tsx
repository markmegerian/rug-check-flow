import { useState } from "react";
import PortalRugsTab from "@/components/portal/PortalRugsTab";
import PortalPickupsTab from "@/components/portal/PortalPickupsTab";
import PortalInvoicesTab from "@/components/portal/PortalInvoicesTab";

type Tab = "rugs" | "pickups" | "invoices";

const TABS: { key: Tab; label: string }[] = [
  { key: "rugs", label: "Rugs" },
  { key: "pickups", label: "Pickups" },
  { key: "invoices", label: "Invoices" },
];

export default function WholesalePortal() {
  const [activeTab, setActiveTab] = useState<Tab>("rugs");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 pt-6 pb-0">
          <h1 className="text-xl font-semibold text-foreground mb-4">Pacific Rug Gallery</h1>
          <nav className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {activeTab === "rugs" && <PortalRugsTab />}
        {activeTab === "pickups" && <PortalPickupsTab />}
        {activeTab === "invoices" && <PortalInvoicesTab />}
      </main>
    </div>
  );
}
