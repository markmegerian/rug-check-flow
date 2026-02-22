import { useState } from "react";
import { Users, Shield, ScrollText } from "lucide-react";
import { UsersTab } from "@/components/admin/UsersTab";
import { RolesTab } from "@/components/admin/RolesTab";
import { AuditLogTab } from "@/components/admin/AuditLogTab";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";

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
      <div className="h-full flex flex-col bg-muted/20">
        <div className="flex-1 min-h-0 flex flex-col md:flex-row m-3 mt-3 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <WorkspaceTabs
            tabs={TABS}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            desktopWidthClassName="md:w-52"
            mobileLabelMode="desktop-only"
            className="bg-muted/30"
          />

          <main className="flex-1 min-w-0 overflow-auto bg-background">
            {activeTab === "users" && <UsersTab />}
            {activeTab === "roles" && <RolesTab />}
            {activeTab === "audit" && <AuditLogTab />}
          </main>
        </div>
      </div>
    </AppShell>
  );
}
