import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Briefcase, Factory, ShieldCheck, Store, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
      <div className="max-w-5xl mx-auto w-full px-4 md:px-6 py-4 md:py-6 space-y-4">
        {/* Compact welcome + roles */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Jump into today&apos;s operations.</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {orderedRoles.length > 0 ? (
              orderedRoles.map((role) => (
                <Badge key={role} variant="secondary" className="text-[10px]">
                  {ROLE_LABELS[role]}
                </Badge>
              ))
            ) : (
              <Badge variant="outline" className="text-[10px]">Portal</Badge>
            )}
          </div>
        </div>

        <OperationalRemindersPanel />

        {/* Single workspace grid — recommended highlighted */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const isRecommended = fallbackRecommendations.some((r) => r.to === s.to);
            return (
              <Link
                key={s.to}
                to={s.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3.5 transition-all hover:shadow-md hover:-translate-y-0.5",
                  isRecommended
                    ? "border-primary/30 bg-primary/5 shadow-sm"
                    : "border-border bg-card"
                )}
              >
                <div className={cn(
                  "p-2 rounded-lg shrink-0",
                  isRecommended ? "bg-primary/15" : "bg-muted"
                )}>
                  <Icon className={cn("h-4 w-4", isRecommended ? "text-primary" : "text-muted-foreground")} />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-foreground">{s.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.description}</div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
              </Link>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
