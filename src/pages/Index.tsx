import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Factory, ShieldCheck, Store, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { OperationalRemindersPanel } from "@/components/dashboard/OperationalRemindersPanel";
import { type AppRole, ROLE_LABELS } from "@/types/app-roles";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";

const ROLE_REDIRECTS: Record<AppRole, string> = {
  checkin_staff: "/ops",
  driver: "/driver",
  office: "/ops",
  admin: "/admin",
};

const SECTIONS: Array<{
  to: string;
  icon: LucideIcon;
  label: string;
  description: string;
  roles: AppRole[];
}> = [
  {
    to: "/ops",
    icon: Factory,
    label: "Operations",
    description: "Floor ops, clients, invoices, production & more",
    roles: ["admin", "office", "checkin_staff"],
  },
  {
    to: "/portal",
    icon: Store,
    label: "Wholesale Portal",
    description: "Client-facing rug tracking & pickups",
    roles: ["admin", "office", "checkin_staff", "driver"],
  },
  {
    to: "/driver",
    icon: Truck,
    label: "Driver Portal",
    description: "Pickup verification & signatures",
    roles: ["admin", "driver"],
  },
  {
    to: "/admin",
    icon: ShieldCheck,
    label: "Admin",
    description: "Users, roles, audit log",
    roles: ["admin"],
  },
];

const ROLE_PRIORITY: AppRole[] = ["admin", "office", "checkin_staff", "driver"];

export default function Index() {
  const { roles, isSuperAdmin } = useAuth();
  const appRoles = roles.filter((role): role is AppRole => role in ROLE_LABELS);
  const orderedRoles = [...appRoles].sort(
    (a, b) => ROLE_PRIORITY.indexOf(a) - ROLE_PRIORITY.indexOf(b)
  );

  // Auto-redirect single-role non-admin users to their primary section
  if (orderedRoles.length === 1 && !orderedRoles.includes("admin")) {
    const primaryRole = orderedRoles[0];
    const redirect = ROLE_REDIRECTS[primaryRole];
    if (redirect) {
      return <Navigate to={redirect} replace />;
    }
  }

  const recommendedPaths = orderedRoles
    .map((role) => ROLE_REDIRECTS[role])
    .filter((path) => path && path !== "/");

  const recommendedSections = [...new Set(recommendedPaths)]
    .map((path) => SECTIONS.find((section) => section.to === path))
    .filter((section): section is (typeof SECTIONS)[number] => Boolean(section))
    .slice(0, 3);

  const fallbackRecommendations = recommendedSections.length > 0 ? recommendedSections : SECTIONS.slice(0, 3);

  return (
    <AppShell
      title={APP_NAME}
      subtitle={APP_TAGLINE}
      showHomeLink={false}
      contentClassName="overflow-auto"
    >
      <div className="max-w-5xl mx-auto w-full px-4 md:px-6 py-6 space-y-6">
        {/* Welcome header */}
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground">Welcome back</h2>
          <p className="text-sm text-muted-foreground">
            Jump into today&apos;s operations with your recommended workflows.
          </p>
          <div className="flex flex-wrap items-center gap-1.5 pt-2">
            {orderedRoles.length > 0 ? (
              orderedRoles.map((role) => (
                <Badge key={role} variant="secondary" className="text-[11px] h-5">
                  {ROLE_LABELS[role]}
                </Badge>
              ))
            ) : (
              <Badge variant="outline" className="text-[11px] h-5">Portal access</Badge>
            )}
            {isSuperAdmin && (
              <Badge variant="outline" className="text-[11px] h-5 border-destructive/30 text-destructive">
                Superadmin
              </Badge>
            )}
          </div>
        </div>

        <OperationalRemindersPanel />

        {/* Recommended actions */}
        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Quick actions
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fallbackRecommendations.map((section) => {
              const Icon = section.icon;
              return (
                <Link
                  key={`recommended-${section.to}`}
                  to={section.to}
                  className="group rounded-lg border border-border bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-primary/8 group-hover:bg-primary/12 transition-colors">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{section.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{section.description}</p>
                    </div>
                  </div>
                  <div className="mt-3 text-xs font-medium text-primary inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    Open <ArrowRight className="h-3 w-3" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* All workspaces */}
        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            All workspaces
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.to}
                  to={s.to}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-primary/30 hover:shadow-sm transition-all"
                >
                  <div className="p-1.5 rounded-md bg-muted">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{s.label}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.description}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
