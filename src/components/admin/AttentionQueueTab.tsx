import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/states/PageState";
import { RugStatusBadge } from "@/components/shared/StatusBadge";
import { useSuperAdminQueues } from "@/hooks/useSuperAdminQueues";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type AttentionActionState = {
  id: string;
  clientName: string;
  rugId: string | null;
  rugNumber: string;
  reason: string;
};

export function AttentionQueueTab({ onOpenRug }: { onOpenRug: (rugId: string) => void }) {
  const query = useSuperAdminQueues();
  const { toast } = useToast();
  const [handlingId, setHandlingId] = useState<string | null>(null);
  const [actionItem, setActionItem] = useState<AttentionActionState | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  const handleMarkHandled = async () => {
    if (!actionItem) return;
    setHandlingId(actionItem.id);
    const note = resolutionNote.trim();
    const { error } = await supabaseExtended.from("communication_events").insert({
      client_id: null,
      rug_id: actionItem.rugId,
      channel: "in_app_chat",
      direction: "outbound",
      event_type: "attention_item_handled",
      subject: actionItem.id,
      body: note || `Handled from admin attention queue for ${actionItem.clientName}`,
    });

    if (error) {
      toast({ title: "Failed to mark handled", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Attention item handled" });
      setActionItem(null);
      setResolutionNote("");
      await query.refetch();
    }
    setHandlingId(null);
  };

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
              <p className="mt-2 text-xs text-muted-foreground">{item.checkedInAt ? `Checked in ${formatDistanceToNow(new Date(item.checkedInAt), { addSuffix: true })}` : `Logged ${formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}`}</p>
            </div>
            <div className="flex items-start gap-2">
              {item.photoUrl ? <img src={item.photoUrl} alt={`Rug ${item.rugNumber}`} className="h-16 w-16 rounded-lg border object-cover" /> : null}
              <div className="flex flex-col gap-2">
                {item.rugId ? <Button size="sm" variant="outline" onClick={() => onOpenRug(item.rugId!)}>Open rug</Button> : null}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setActionItem({
                      id: item.id,
                      clientName: item.clientName,
                      rugId: item.rugId,
                      rugNumber: item.rugNumber,
                      reason: item.reason,
                    });
                    setResolutionNote("");
                  }}
                  disabled={handlingId === item.id}
                >
                  {handlingId === item.id ? "Handling..." : "Mark handled"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ))}

      <Dialog open={Boolean(actionItem)} onOpenChange={(open) => { if (!open && !handlingId) { setActionItem(null); setResolutionNote(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve attention item</DialogTitle>
            <DialogDescription>
              Mark this item handled and save a resolution note to the activity log.
            </DialogDescription>
          </DialogHeader>
          {actionItem ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
                <div className="font-medium text-foreground">{actionItem.rugNumber}</div>
                <div className="mt-1 text-muted-foreground">{actionItem.clientName}</div>
                <div className="mt-2 text-foreground">{actionItem.reason}</div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="attention-resolution-note">Resolution note</Label>
                <Textarea
                  id="attention-resolution-note"
                  value={resolutionNote}
                  onChange={(event) => setResolutionNote(event.target.value)}
                  rows={4}
                  placeholder="What did you do to handle this exception?"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionItem(null); setResolutionNote(""); }} disabled={Boolean(handlingId)}>Cancel</Button>
            <Button onClick={() => void handleMarkHandled()} disabled={Boolean(handlingId)}>{handlingId ? "Saving..." : "Mark handled"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
