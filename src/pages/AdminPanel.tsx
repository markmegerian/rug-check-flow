import { useState } from "react";
import { Users, Shield, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { UsersTab } from "@/components/admin/UsersTab";
import { RolesTab } from "@/components/admin/RolesTab";
import { AuditLogTab } from "@/components/admin/AuditLogTab";
import { AppShell } from "@/components/layout/AppShell";

const TABS = [
  { id: "users", label: "Users", icon: Users, subtitle: "Directory and access management" },
  { id: "roles", label: "Roles", icon: Shield, subtitle: "Permission distribution overview" },
  { id: "audit", label: "Audit Log", icon: ScrollText, subtitle: "System activity timeline" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("users");
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  return (
    <AppShell
      title="Admin Workspace"
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

        <main className="flex-1 min-w-0 overflow-auto">
          {activeTab === "users" && <UsersTab />}
          {activeTab === "roles" && <RolesTab />}
          {activeTab === "audit" && <AuditLogTab />}
        </main>
      </div>
    </AppShell>
  );
}
