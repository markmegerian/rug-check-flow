import { Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOperationalReminders, type OperationalReminder } from "@/hooks/useOperationalReminders";
import { cn } from "@/lib/utils";

const SEVERITY_BADGE: Record<OperationalReminder["severity"], string> = {
  default: "bg-muted text-muted-foreground",
  warning: "bg-warning/10 text-warning border-warning/20",
  critical: "bg-destructive/10 text-destructive border-destructive/20",
};

export function WorkspaceStatusBar() {
  const { reminders, loading } = useOperationalReminders();
  const activeReminders = reminders.filter((r) => r.count > 0);

  if (loading || activeReminders.length === 0) return null;

  return (
    <div className="mx-2 mt-2 flex items-center gap-1.5 overflow-x-auto rounded-[1rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(245,248,255,0.82))] px-3 py-2 text-xs shadow-[0_14px_32px_-26px_rgba(51,84,181,0.16)] scrollbar-hide md:mx-4">
      <AlertCircle className="h-3 w-3 shrink-0 text-muted-foreground" />
      {activeReminders.map((reminder) => (
        <Link key={reminder.id} to={reminder.href}>
          <Badge
            variant="outline"
            className={cn(
              "h-5 cursor-pointer px-1.5 text-[10px] transition-opacity hover:opacity-80",
              SEVERITY_BADGE[reminder.severity],
            )}
          >
            {reminder.count} {reminder.label.replace(/\s*>\s*3\s*days?/, "").replace("Overdue i", "overdue i")}
          </Badge>
        </Link>
      ))}
    </div>
  );
}
