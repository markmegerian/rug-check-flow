import { useState } from "react";
import PortalRugsTab from "@/components/portal/PortalRugsTab";
import PortalPickupsTab from "@/components/portal/PortalPickupsTab";
import PortalInvoicesTab from "@/components/portal/PortalInvoicesTab";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

type Tab = "rugs" | "pickups" | "invoices";

const TABS: { key: Tab; label: string }[] = [
  { key: "rugs", label: "Rugs" },
  { key: "pickups", label: "Pickups" },
  { key: "invoices", label: "Invoices" },
];

export default function WholesalePortal() {
  const [activeTab, setActiveTab] = useState<Tab>("rugs");

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-3 pt-4 pb-1">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-base font-semibold text-foreground tracking-tight">Pacific Rug Gallery</h1>
          </div>
          <nav className="flex gap-0 -mb-px ml-7">
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
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-5">
        {activeTab === "rugs" && <PortalRugsTab />}
        {activeTab === "pickups" && <PortalPickupsTab />}
        {activeTab === "invoices" && <PortalInvoicesTab />}
      </main>
    </div>
  );
}
