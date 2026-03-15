import { Link, useLocation } from "react-router-dom";
import { Factory, Briefcase, ShieldCheck, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOperationalReminders, type OperationalReminder } from "@/hooks/useOperationalReminders";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type WorkspaceLink = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
};

const WORKSPACES: WorkspaceLink[] = [
  { to: "/facility/ops", label: "Ops", icon: Factory, roles: ["admin", "office", "checkin_staff"] },
  { to: "/facility/office", label: "Office", icon: Briefcase, roles: ["admin", "office"] },
  { to: "/admin", label: "Admin", icon: ShieldCheck, roles: ["admin"] },
];

const SEVERITY_BADGE: Record<OperationalReminder["severity"], string> = {
  default: "bg-muted text-muted-foreground",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

export function WorkspaceStatusBar() {
  const { pathname } = useLocation();
  const { roles } = useAuth();
  const { reminders, loading } = useOperationalReminders();

  const otherWorkspaces = WORKSPACES.filter(
    (ws) => ws.to !== pathname && ws.roles.some((r) => roles.includes(r as any))
  );

  const activeReminders = reminders.filter((r) => r.count > 0);

  if (loading && otherWorkspaces.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 md:px-6 py-1.5 border-b border-border/50 bg-muted/20 text-xs overflow-x-auto">
      {/* Reminder badges */}
      {activeReminders.length > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          <AlertCircle className="h-3 w-3 text-muted-foreground shrink-0" />
          {activeReminders.map((reminder) => (
            <Link key={reminder.id} to={reminder.href}>
              <Badge
                variant="secondary"
                className={cn(
                  "text-[10px] h-5 px-1.5 cursor-pointer hover:opacity-80 transition-opacity",
                  SEVERITY_BADGE[reminder.severity]
                )}
              >
                {reminder.count} {reminder.label.replace(/\s*>\s*3\s*days?/, "").replace("Overdue i", "overdue i")}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {/* Spacer */}
      {activeReminders.length > 0 && otherWorkspaces.length > 0 && (
        <div className="w-px h-3.5 bg-border/60 shrink-0" />
      )}

      {/* Workspace quick-jump links */}
      {otherWorkspaces.length > 0 && (
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          {otherWorkspaces.map((ws) => {
            const Icon = ws.icon;
            return (
              <Link
                key={ws.to}
                to={ws.to}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                <Icon className="h-3 w-3" />
                <span>{ws.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
