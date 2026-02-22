import { useEffect, useState } from "react";
import { Users, Shield, ScrollText } from "lucide-react";
import { UsersTab } from "@/components/admin/UsersTab";
import { RolesTab } from "@/components/admin/RolesTab";
import { AuditLogTab } from "@/components/admin/AuditLogTab";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { WorkspaceUpdatesStrip } from "@/components/layout/WorkspaceUpdatesStrip";
import { supabaseExtended } from "@/integrations/supabase/extended";

const TABS = [
  { id: "users", label: "Users", icon: Users, subtitle: "Directory and access management" },
  { id: "roles", label: "Roles", icon: Shield, subtitle: "Permission distribution overview" },
  { id: "audit", label: "Audit Log", icon: ScrollText, subtitle: "System activity timeline" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("users");
  const [metrics, setMetrics] = useState({
    auditToday: 0,
    invitedPortalUsers: 0,
    assignedPickups: 0,
    adminUsers: 0,
    loading: true,
  });
  const activeTabMeta = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  useEffect(() => {
    let active = true;
    const loadMetrics = async () => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);

      const [auditRes, invitedRes, assignedRes, adminRes] = await Promise.all([
        supabaseExtended
          .from("audit_log")
          .select("id", { count: "exact", head: true })
          .gte("created_at", dayStart.toISOString()),
        supabaseExtended
          .from("portal_users")
          .select("id", { count: "exact", head: true })
          .eq("status", "invited"),
        supabaseExtended
          .from("pickup_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "assigned"),
        supabaseExtended
          .from("user_roles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin"),
      ]);

      if (!active) return;

      setMetrics({
        auditToday: auditRes.count ?? 0,
        invitedPortalUsers: invitedRes.count ?? 0,
        assignedPickups: assignedRes.count ?? 0,
        adminUsers: adminRes.count ?? 0,
        loading: false,
      });
    };

    loadMetrics();
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppShell
      title="Admin Workspace"
      subtitle={`${activeTabMeta.label} · ${activeTabMeta.subtitle}`}
      contentClassName="overflow-hidden"
    >
      <div className="h-full flex flex-col bg-muted/20">
        <WorkspaceUpdatesStrip
          className="mx-3 mt-3 shadow-sm"
          loading={metrics.loading}
          updates={[
            {
              id: "admin-audit-today",
              label: "Audit events today",
              value: metrics.auditToday,
              detail: "System actions logged since midnight",
              tone: "info",
            },
            {
              id: "admin-portal-invites",
              label: "Pending portal invites",
              value: metrics.invitedPortalUsers,
              detail: "Portal users invited but not active",
              tone: metrics.invitedPortalUsers > 0 ? "warning" : "neutral",
            },
            {
              id: "admin-assigned-pickups",
              label: "Assigned pickups in progress",
              value: metrics.assignedPickups,
              detail: "Driver-assigned requests not yet completed",
              tone: metrics.assignedPickups > 0 ? "info" : "neutral",
            },
            {
              id: "admin-admin-users",
              label: "Active admin roles",
              value: metrics.adminUsers,
              detail: "Users with full administrative access",
              tone: "neutral",
            },
          ]}
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
