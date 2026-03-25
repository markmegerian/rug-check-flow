import { useCallback, useState } from "react";
import { Users, Shield, ScrollText, Store, Activity, LayoutDashboard, BellRing, Receipt, TriangleAlert, RotateCcw } from "lucide-react";
import { UsersTab } from "@/components/admin/UsersTab";
import { RolesTab } from "@/components/admin/RolesTab";
import { AuditLogTab } from "@/components/admin/AuditLogTab";
import { DataHealthCard } from "@/components/admin/DataHealthCard";
import { ClientsTab } from "@/components/office/ClientsTab";
import { SuperAdminOverview } from "@/components/admin/SuperAdminOverview";
import { ClientResponsesTab } from "@/components/admin/ClientResponsesTab";
import { CollectionsTab } from "@/components/admin/CollectionsTab";
import { AttentionQueueTab } from "@/components/admin/AttentionQueueTab";
import { ReturnsTab } from "@/components/admin/ReturnsTab";
import { RugSearchDialog } from "@/components/facility/RugSearchDialog";
import { RugDetailSheet } from "@/components/facility/RugDetailSheet";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "responses", label: "Responses", icon: BellRing },
  { id: "collections", label: "Collections", icon: Receipt },
  { id: "attention", label: "Attention", icon: TriangleAlert },
  { id: "returns", label: "Returns", icon: RotateCcw },
  { id: "users", label: "Users", icon: Users },
  { id: "clients", label: "Accounts", icon: Store },
  { id: "health", label: "Data Health", icon: Activity },
  { id: "roles", label: "Roles", icon: Shield },
  { id: "audit", label: "Audit Log", icon: ScrollText },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
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

      <div className="flex-1 min-w-0 min-h-0 overflow-auto rounded-t-[1.75rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,249,252,0.88))] shadow-[0_28px_70px_-42px_rgba(15,23,42,0.42)] backdrop-blur-md md:mx-4">
        {activeTab === "overview" && <SuperAdminOverview onOpenRug={handleRugSelect} onSelectTab={(tab) => setActiveTab(tab as TabId)} />}
        {activeTab === "responses" && <ClientResponsesTab />}
        {activeTab === "collections" && <CollectionsTab />}
        {activeTab === "attention" && <AttentionQueueTab onOpenRug={handleRugSelect} />}
        {activeTab === "returns" && <ReturnsTab onOpenRug={handleRugSelect} />}
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
