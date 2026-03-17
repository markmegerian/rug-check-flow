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
    <div className="flex items-center gap-1.5 px-3 md:px-4 py-1.5 border-b border-border bg-muted/30 text-xs overflow-x-auto scrollbar-hide">
      <AlertCircle className="h-3 w-3 text-muted-foreground shrink-0" />
      {activeReminders.map((reminder) => (
        <Link key={reminder.id} to={reminder.href}>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] h-5 px-1.5 cursor-pointer hover:opacity-80 transition-opacity",
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
