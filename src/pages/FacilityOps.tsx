import { useState } from "react";
import { ClipboardCheck, Factory, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckInLayout } from "@/components/facility/CheckInLayout";
import { ProductionBoard } from "@/components/facility/ProductionBoard";
import { PendingPickupsPanel } from "@/components/facility/PendingPickupsPanel";

const TABS = [
  { id: "checkin", label: "Check-In", icon: ClipboardCheck },
  { id: "production", label: "Production", icon: Factory },
  { id: "pickups", label: "Pending Pickups", icon: Truck },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function FacilityOps() {
  const [activeTab, setActiveTab] = useState<TabId>("checkin");

  return (
    <div className="h-screen flex bg-background">
      {/* Vertical tab nav */}
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

      {/* Tab content */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {activeTab === "checkin" && <CheckInLayout />}
        {activeTab === "production" && <ProductionBoard />}
        {activeTab === "pickups" && <PendingPickupsPanel />}
      </main>
    </div>
  );
}
