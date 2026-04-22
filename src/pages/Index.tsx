import { Link, Navigate } from "react-router-dom";
import { ArrowRight, ClipboardCheck, Factory, FolderOpen, ShieldCheck, Store, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { OperationalRemindersPanel } from "@/components/dashboard/OperationalRemindersPanel";
import { type AppRole, ROLE_LABELS } from "@/types/app-roles";
import { APP_NAME, APP_TAGLINE } from "@/lib/branding";

const ROLE_REDIRECTS: Record<AppRole, string> = {
  checkin_staff: "/checkin",
  driver: "/driver",
  office: "/office/jobs",
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
    to: "/checkin",
    icon: ClipboardCheck,
    label: "Check-In Intake",
    description: "Fast rug intake, walk-ins, pending pickup check-in, and intake support",
    roles: ["admin", "office", "checkin_staff"],
  },
  {
    to: "/facility/production",
    icon: Factory,
    label: "Facility Workflow",
    description: "Production, delivery prep, and facility work beyond intake",
    roles: ["admin", "office", "checkin_staff"],
  },
  {
    to: "/office/jobs",
    icon: FolderOpen,
    label: "Office Attention",
    description: "Clients, jobs, estimates, and office coordination",
    roles: ["admin", "office", "checkin_staff"],
  },
  {
    to: "/logistics/routes",
    icon: Truck,
    label: "Logistics",
    description: "Deliveries, routes, proofs, and driver execution",
    roles: ["admin", "office", "checkin_staff", "driver"],
  },
  {
    to: "/finance/invoices",
    icon: ShieldCheck,
    label: "Finance Management",
    description: "Invoices, payments, credits, and collections",
    roles: ["admin", "office"],
  },
  {
    to: "/portal",
    icon: Store,
    label: "Client Portal",
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
      <div className="app-page space-y-6">
        <section className="app-hero space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="app-chip">Today&apos;s focus</p>
              <h2 className="text-balance text-2xl font-semibold text-foreground sm:text-3xl">Welcome back</h2>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                Jump into today&apos;s priority workflows from the surfaces that matter most.
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,247,255,0.92))] px-4 py-3 text-sm text-muted-foreground shadow-[0_20px_52px_-34px_rgba(62,91,197,0.2)]">
              <div className="font-medium text-foreground">Premium mobile pass</div>
              <div className="mt-1 text-xs sm:text-sm">Faster entry points, cleaner cards, better touch targets.</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {orderedRoles.length > 0 ? (
              orderedRoles.map((role) => (
                <Badge key={role} variant="secondary" className="h-6 rounded-full px-2.5 text-[11px]">
                  {ROLE_LABELS[role]}
                </Badge>
              ))
            ) : (
              <Badge variant="outline" className="h-6 rounded-full px-2.5 text-[11px]">Portal access</Badge>
            )}
            {isSuperAdmin && (
              <Badge variant="outline" className="h-6 rounded-full border-destructive/30 px-2.5 text-[11px] text-destructive">
                Mission Control
              </Badge>
            )}
          </div>
        </section>

        <OperationalRemindersPanel />

        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recommended next work
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {fallbackRecommendations.map((section) => {
              const Icon = section.icon;
              return (
                <Link
                  key={`recommended-${section.to}`}
                  to={section.to}
                  className="group rounded-[1.4rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,248,255,0.94))] p-4 shadow-[0_22px_52px_-36px_rgba(62,91,197,0.22)] transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_26px_56px_-32px_rgba(99,102,241,0.38)] sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-[linear-gradient(180deg,hsl(var(--primary)/0.14),hsl(var(--primary)/0.08))] p-2.5 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] transition-colors group-hover:bg-[linear-gradient(180deg,hsl(var(--primary)/0.18),hsl(var(--primary)/0.1))]">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground sm:text-base">{section.label}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:text-sm">{section.description}</p>
                    </div>
                  </div>
                  <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                    Open <ArrowRight className="h-3 w-3" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            All workflow surfaces
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.to}
                  to={s.to}
                  className="flex min-h-[88px] items-center gap-3 rounded-[1.3rem] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,249,255,0.93))] px-4 py-3 shadow-[0_18px_42px_-34px_rgba(40,61,120,0.18)] transition-all hover:border-primary/25 hover:shadow-[0_22px_48px_-30px_rgba(62,91,197,0.28)]"
                >
                  <div className="rounded-xl bg-[linear-gradient(180deg,rgba(230,238,255,0.95),rgba(241,245,255,0.9))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{s.label}</div>
                    <div className="truncate text-xs text-muted-foreground">{s.description}</div>
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
