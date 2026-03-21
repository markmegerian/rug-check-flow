import { useCallback, useState } from "react";
import { Users, Shield, ScrollText, Store, Activity } from "lucide-react";
import { UsersTab } from "@/components/admin/UsersTab";
import { RolesTab } from "@/components/admin/RolesTab";
import { AuditLogTab } from "@/components/admin/AuditLogTab";
import { DataHealthCard } from "@/components/admin/DataHealthCard";
import { ClientsTab } from "@/components/office/ClientsTab";
import { RugSearchDialog } from "@/components/facility/RugSearchDialog";
import { RugDetailSheet } from "@/components/facility/RugDetailSheet";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";

const TABS = [
  { id: "users", label: "Users", icon: Users },
  { id: "clients", label: "Accounts", icon: Store },
  { id: "health", label: "Data Health", icon: Activity },
  { id: "roles", label: "Roles", icon: Shield },
  { id: "audit", label: "Audit Log", icon: ScrollText },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("users");
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailRugId, setDetailRugId] = useState<string | null>(null);
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const handleRugSelect = useCallback((rugId: string) => setDetailRugId(rugId), []);

  return (
    <AppShell
      title="Admin"
      subtitle={activeTabMeta.label}
      contentClassName="overflow-hidden flex flex-col"
      statusBar={<WorkspaceStatusBar />}
      onSearchOpen={() => setSearchOpen(true)}
    >
      <WorkspaceTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId as TabId)}
      />

      <div className="flex-1 min-w-0 min-h-0 overflow-auto">
        {activeTab === "users" && <UsersTab />}
        {activeTab === "clients" && <ClientsTab />}
        {activeTab === "health" && (
          <div className="max-w-3xl mx-auto p-4 md:p-6">
            <DataHealthCard />
          </div>
        )}
        {activeTab === "roles" && <RolesTab />}
        {activeTab === "audit" && <AuditLogTab />}
      </div>

      <RugSearchDialog open={searchOpen} onOpenChange={setSearchOpen} onSelectRug={handleRugSelect} />
      <RugDetailSheet rugId={detailRugId} open={Boolean(detailRugId)} onOpenChange={(open) => { if (!open) setDetailRugId(null); }} />
    </AppShell>
  );
}
