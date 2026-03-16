import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Briefcase, Factory, ShieldCheck, Store, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { OperationalRemindersPanel } from "@/components/dashboard/OperationalRemindersPanel";
import { type AppRole, ROLE_LABELS } from "@/types/app-roles";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";

const ROLE_REDIRECTS: Record<AppRole, string> = {
  checkin_staff: "/facility/ops",
  driver: "/driver",
  office: "/facility/office",
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
    to: "/facility/ops",
    icon: Factory,
    label: "Facility Ops",
    description: "Check-in, production board, pending rugs",
    roles: ["admin", "office", "checkin_staff"],
  },
  {
    to: "/facility/office",
    icon: Briefcase,
    label: "Office",
    description: "Clients, pricing, invoices",
    roles: ["admin", "office"],
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
  const { user, roles, isSuperAdmin } = useAuth();
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
      <div className="max-w-6xl mx-auto w-full px-6 py-6 md:py-8 space-y-6">
        <section className="rounded-xl border bg-card p-5 md:p-6">
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h2 className="text-2xl font-semibold mt-1">Focus on your top workflows first.</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Use recommended actions to jump directly into today&apos;s operations.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {orderedRoles.length > 0 ? (
              orderedRoles.map((role) => (
                <Badge key={role} variant="secondary">
                  {ROLE_LABELS[role]}
                </Badge>
              ))
            ) : (
              <Badge variant="outline">Portal access</Badge>
            )}
            {isSuperAdmin ? (
              <Badge className="border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300">
                Superadmin
              </Badge>
            ) : null}
            {user?.email ? (
              <Badge variant="outline" className="hidden sm:inline-flex">
                {user.email}
              </Badge>
            ) : null}
          </div>
        </section>

        <OperationalRemindersPanel />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Recommended next actions
            </h3>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {fallbackRecommendations.map((section) => {
              const Icon = section.icon;
              return (
                <Link
                  key={`recommended-${section.to}`}
                  to={section.to}
                  className="rounded-lg border bg-card p-4 hover:bg-accent transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold">{section.label}</p>
                      <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                    </div>
                    <div className="p-2 rounded-md bg-primary/10">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                  <div className="pt-3 text-sm font-medium text-primary inline-flex items-center gap-1">
                    Open workspace <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            All workspaces
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SECTIONS.map((s, i) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.to}
                  to={s.to}
                  className="flex items-start gap-4 rounded-lg border border-border bg-card p-5 shadow-card transition-all hover:shadow-medium hover:-translate-y-0.5 animate-fade-in-up"
                  style={{ animationDelay: `${i * 50}ms`, opacity: 0 }}
                >
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{s.label}</div>
                    <div className="text-sm text-muted-foreground mt-1">{s.description}</div>
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
