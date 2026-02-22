import { useState } from "react";
import { Users, Shield, ScrollText } from "lucide-react";
import { UsersTab } from "@/components/admin/UsersTab";
import { RolesTab } from "@/components/admin/RolesTab";
import { AuditLogTab } from "@/components/admin/AuditLogTab";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { WorkspaceQuickActions } from "@/components/layout/WorkspaceQuickActions";

const TABS = [
  { id: "users", label: "Users", icon: Users, subtitle: "Directory and access management" },
  { id: "roles", label: "Roles", icon: Shield, subtitle: "Permission distribution overview" },
  { id: "audit", label: "Audit Log", icon: ScrollText, subtitle: "System activity timeline" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const QUICK_ACTIONS = [
  {
    id: "quick-users",
    title: "Manage users",
    description: "Assign and update workspace access by role.",
    icon: Users,
    tab: "users",
  },
  {
    id: "quick-roles",
    title: "Review role coverage",
    description: "Verify distribution across admin, office, and driver roles.",
    icon: Shield,
    tab: "roles",
  },
  {
    id: "quick-audit",
    title: "Inspect activity",
    description: "Audit recent operational and access changes.",
    icon: ScrollText,
    tab: "audit",
  },
] as const;

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
        <WorkspaceQuickActions
          className="mx-3 mt-3 rounded-xl border border-border bg-card shadow-sm"
          actions={QUICK_ACTIONS}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />

        <div className="flex-1 min-h-0 flex flex-col md:flex-row m-3 mt-2 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
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
