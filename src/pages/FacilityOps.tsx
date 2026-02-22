import { useState } from "react";
import { ClipboardCheck, Factory, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckInLayout } from "@/components/facility/CheckInLayout";
import { ProductionBoard } from "@/components/facility/ProductionBoard";
import { PendingPickupsPanel } from "@/components/facility/PendingPickupsPanel";
import { AppShell } from "@/components/layout/AppShell";

const TABS = [
  { id: "checkin", label: "Check-In", icon: ClipboardCheck, subtitle: "Intake and service capture" },
  { id: "production", label: "Production", icon: Factory, subtitle: "Track rugs through production stages" },
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
      <div className="h-full flex flex-col md:flex-row bg-background">
        {/* Bottom tab bar on mobile, vertical sidebar on desktop */}
        <nav className="order-last md:order-first md:w-48 border-t md:border-t-0 md:border-r border-border bg-card/60 backdrop-blur-sm flex md:flex-col shrink-0 z-20">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 md:flex-none flex flex-col md:flex-row items-center gap-0.5 md:gap-3 px-1 py-2 md:px-4 md:py-3 text-xs md:text-sm font-medium transition-colors",
                  active
                    ? "bg-background text-foreground md:shadow-sm md:border-r-2 md:border-primary border-t-2 md:border-t-0 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="md:inline">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden">
          {activeTab === "checkin" && <CheckInLayout />}
          {activeTab === "production" && <ProductionBoard />}
          {activeTab === "pickups" && <PendingPickupsPanel />}
        </main>
      </div>
    </AppShell>
  );
}
