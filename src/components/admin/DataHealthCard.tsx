import { Link } from "react-router-dom";
import { Activity, AlertTriangle, CheckCircle, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDataIntegrity, type IntegrityIssue } from "@/hooks/useDataIntegrity";
import { cn } from "@/lib/utils";

const SEVERITY_STYLES: Record<IntegrityIssue["severity"], string> = {
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

const SEVERITY_ICON: Record<IntegrityIssue["severity"], typeof AlertTriangle> = {
  warning: AlertTriangle,
  critical: ShieldAlert,
};

export function DataHealthCard() {
  const { issues, loading, refresh } = useDataIntegrity();
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Data Health</h3>
          {!loading && issues.length === 0 && (
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 text-[10px]">
              All clear
            </Badge>
          )}
          {!loading && criticalCount > 0 && (
            <Badge variant="secondary" className="bg-red-100 text-red-800 text-[10px]">
              {criticalCount} critical
            </Badge>
          )}
          {!loading && warningCount > 0 && criticalCount === 0 && (
            <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px]">
              {warningCount} warning{warningCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={loading} aria-label="Refresh data health">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Scanning data integrity...</p>
      ) : issues.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
          <CheckCircle className="h-4 w-4" />
          No data integrity issues detected.
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => {
            const SeverityIcon = SEVERITY_ICON[issue.severity];
            const content = (
              <div className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent">
                <div className={cn("p-1.5 rounded-md mt-0.5", SEVERITY_STYLES[issue.severity])}>
                  <SeverityIcon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{issue.title}</span>
                    <Badge variant="secondary" className="text-[10px]">{issue.count}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{issue.description}</p>
                </div>
              </div>
            );

            return issue.href ? (
              <Link key={issue.id} to={issue.href}>{content}</Link>
            ) : (
              <div key={issue.id}>{content}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
