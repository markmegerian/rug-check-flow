import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/states/PageState";
import { RugStatusBadge } from "@/components/shared/StatusBadge";
import { useSuperAdminQueues } from "@/hooks/useSuperAdminQueues";

export function AttentionQueueTab({ onOpenRug }: { onOpenRug: (rugId: string) => void }) {
  const query = useSuperAdminQueues();

  if (query.isLoading) {
    return (
      <div className="app-page flex h-full items-center justify-center">
        <LoadingState title="Loading attention queue" description="Finding stale and note-flagged rugs..." />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <div className="app-page p-4 text-sm text-destructive">Failed to load rugs needing attention.</div>;
  }

  return (
    <div className="app-page h-full overflow-auto space-y-4 animate-fade-in-up">
      <div className="app-section-header">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Attention Queue</h2>
          <p className="text-sm text-muted-foreground">Route exceptions first, then stale and note-flagged rugs.</p>
        </div>
      </div>
      {query.data.attentionItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/70 p-8 text-center text-muted-foreground">No route exceptions or stale rugs currently need attention.</div>
      ) : query.data.attentionItems.map((item) => (
        <div key={item.id} className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-foreground">{item.rugNumber}</span>
                <Badge variant="secondary">{item.kind === "route_exception" ? "Exception" : item.kind === "reentry_event" ? "Re-entry" : "Stale rug"}</Badge>
                {item.status ? <RugStatusBadge status={item.status} /> : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{item.clientName}</p>
              <p className="mt-1 text-sm text-foreground">{item.reason}</p>
              <p className="mt-2 text-xs text-muted-foreground">Checked in {formatDistanceToNow(new Date(item.checkedInAt), { addSuffix: true })}</p>
            </div>
            <div className="flex items-start gap-3">
              {item.photoUrl ? <img src={item.photoUrl} alt={`Rug ${item.rugNumber}`} className="h-16 w-16 rounded-lg border object-cover" /> : null}
              <Button size="sm" variant="outline" onClick={() => onOpenRug(item.rugId)}>Open rug</Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
