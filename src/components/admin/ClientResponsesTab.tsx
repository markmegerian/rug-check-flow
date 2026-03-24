import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/states/PageState";
import { useSuperAdminQueues } from "@/hooks/useSuperAdminQueues";

export function ClientResponsesTab() {
  const query = useSuperAdminQueues();

  if (query.isLoading) {
    return (
      <div className="app-page flex h-full items-center justify-center">
        <LoadingState title="Loading client responses" description="Gathering recent portal decisions..." />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <div className="app-page p-4 text-sm text-destructive">Failed to load client responses.</div>;
  }

  return (
    <div className="app-page h-full overflow-auto space-y-4 animate-fade-in-up">
      <div className="app-section-header">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Client Responses</h2>
          <p className="text-sm text-muted-foreground">Recent estimate approvals, rejections, and invoice views.</p>
        </div>
      </div>
      {query.data.clientResponses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/70 p-8 text-center text-muted-foreground">No recent client responses.</div>
      ) : query.data.clientResponses.map((item) => (
        <div key={item.id} className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">{item.clientName}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.title}</p>
            </div>
            <Badge variant="secondary" className={item.tone === "success" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : item.tone === "danger" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" : ""}>
              {item.tone === "success" ? "Approved" : item.tone === "danger" ? "Rejected" : "Viewed"}
            </Badge>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</p>
        </div>
      ))}
    </div>
  );
}
