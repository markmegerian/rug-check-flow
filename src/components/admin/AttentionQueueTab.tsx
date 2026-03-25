import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/states/PageState";
import { RugStatusBadge } from "@/components/shared/StatusBadge";
import { useSuperAdminQueues } from "@/hooks/useSuperAdminQueues";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AttentionActionState = {
  id: string;
  clientName: string;
  rugId: string | null;
  rugNumber: string;
  reason: string;
};

const CATEGORY_META: Record<string, { label: string; tone: string }> = {
  immediate_return: { label: "Immediate return", tone: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  reentry: { label: "Re-entry", tone: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200" },
  route_dispute: { label: "Route dispute", tone: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  unable_to_complete: { label: "Unable to complete", tone: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  stale_rug: { label: "Stale rug", tone: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100" },
  note_flag: { label: "Special note", tone: "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-100" },
  route_exception: { label: "Route exception", tone: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
};

const RETURN_TARGET_STATES = [
  { value: "picked_up", label: "Picked up" },
  { value: "checked_in", label: "Checked in" },
  { value: "in_production", label: "In production" },
  { value: "ready", label: "Ready for delivery" },
] as const;

export function AttentionQueueTab({ onOpenRug }: { onOpenRug: (rugId: string) => void }) {
  const query = useSuperAdminQueues();
  const { toast } = useToast();
  const [handlingId, setHandlingId] = useState<string | null>(null);
  const [actionItem, setActionItem] = useState<AttentionActionState | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [returnTargetState, setReturnTargetState] =
    useState<(typeof RETURN_TARGET_STATES)[number]["value"]>("checked_in");
  const [returningId, setReturningId] = useState<string | null>(null);

  const closeDialog = () => {
    if (handlingId || returningId) return;
    setActionItem(null);
    setResolutionNote("");
    setReturnTargetState("checked_in");
  };

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
      toast({
        title: "Failed to mark handled",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Attention item handled" });
      closeDialog();
      await query.refetch();
    }
    setHandlingId(null);
  };

  const handleReturnToWorkflow = async () => {
    if (!actionItem?.rugId) return;
    setReturningId(actionItem.id);
    const now = new Date().toISOString();
    const updates: Record<string, string | null> = { status: returnTargetState };

    if (resolutionNote.trim()) {
      const { data: rugRow } = await supabase
        .from("rugs")
        .select("notes")
        .eq("id", actionItem.rugId)
        .maybeSingle();
      updates.notes = [
        rugRow?.notes?.trim(),
        `[${new Date(now).toLocaleString()}] Returned to ${returnTargetState}: ${resolutionNote.trim()}`,
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    if (returnTargetState === "picked_up") updates.picked_up_at = now;
    if (returnTargetState === "checked_in") updates.checked_in_at = now;
    if (returnTargetState === "ready") updates.completed_at = now;
    if (returnTargetState !== "ready") updates.completed_at = null;

    const { error: rugError } = await supabase
      .from("rugs")
      .update(updates)
      .eq("id", actionItem.rugId);

    if (rugError) {
      toast({
        title: "Workflow return failed",
        description: rugError.message,
        variant: "destructive",
      });
      setReturningId(null);
      return;
    }

    const { error: eventError } = await supabaseExtended.from("communication_events").insert({
      client_id: null,
      rug_id: actionItem.rugId,
      channel: "in_app_chat",
      direction: "outbound",
      event_type: "attention_item_handled",
      subject: actionItem.id,
      body: `Returned to workflow as ${returnTargetState}${resolutionNote.trim() ? `\n\n${resolutionNote.trim()}` : ""}`,
    });

    if (eventError) {
      toast({
        title: "Workflow note failed",
        description: eventError.message,
        variant: "destructive",
      });
    } else {
      toast({ title: `Moved to ${returnTargetState}` });
      closeDialog();
      await query.refetch();
    }
    setReturningId(null);
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
        <div className="rounded-2xl border border-dashed border-border/70 bg-card/70 p-8 text-center text-muted-foreground">
          No route exceptions or stale rugs currently need attention.
        </div>
      ) : (
        query.data.attentionItems.map((item) => (
          <div key={item.id} className="rounded-2xl border border-border/70 bg-card/95 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">{item.rugNumber}</span>
                  <Badge variant="secondary" className={CATEGORY_META[item.category].tone}>
                    {CATEGORY_META[item.category].label}
                  </Badge>
                  {item.status ? <RugStatusBadge status={item.status} /> : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{item.clientName}</p>
                <p className="mt-1 text-sm text-foreground">{item.reason}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.checkedInAt
                    ? `Checked in ${formatDistanceToNow(new Date(item.checkedInAt), { addSuffix: true })}`
                    : `Logged ${formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}`}
                </p>
              </div>
              <div className="flex items-start gap-2">
                {item.photoUrl ? (
                  <img
                    src={item.photoUrl}
                    alt={`Rug ${item.rugNumber}`}
                    className="h-16 w-16 rounded-lg border object-cover"
                  />
                ) : null}
                <div className="flex flex-col gap-2">
                  {item.rugId ? (
                    <Button size="sm" variant="outline" onClick={() => onOpenRug(item.rugId!)}>
                      Open rug
                    </Button>
                  ) : null}
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
                      setReturnTargetState(item.kind === "stale_rug" ? "ready" : "checked_in");
                    }}
                    disabled={handlingId === item.id || returningId === item.id}
                  >
                    {handlingId === item.id || returningId === item.id ? "Working..." : "Take action"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))
      )}

      <Dialog open={Boolean(actionItem)} onOpenChange={(open) => (!open ? closeDialog() : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve attention item</DialogTitle>
            <DialogDescription>
              Mark this item handled or push the rug back into the correct workflow state.
            </DialogDescription>
          </DialogHeader>
          {actionItem ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm">
                <div className="font-medium text-foreground">{actionItem.rugNumber}</div>
                <div className="mt-1 text-muted-foreground">{actionItem.clientName}</div>
                <div className="mt-2 text-foreground">{actionItem.reason}</div>
                <div className="mt-2">
                  <Badge variant="secondary" className={CATEGORY_META[(query.data?.attentionItems.find((item) => item.id === actionItem.id)?.category ?? "route_exception")].tone}>
                    {CATEGORY_META[(query.data?.attentionItems.find((item) => item.id === actionItem.id)?.category ?? "route_exception")].label}
                  </Badge>
                </div>
              </div>
              {actionItem.rugId ? (
                <div className="space-y-2">
                  <Label htmlFor="attention-target-state">Return to workflow state</Label>
                  <Select
                    value={returnTargetState}
                    onValueChange={(value) =>
                      setReturnTargetState(value as (typeof RETURN_TARGET_STATES)[number]["value"])
                    }
                  >
                    <SelectTrigger id="attention-target-state">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RETURN_TARGET_STATES.map((state) => (
                        <SelectItem key={state.value} value={state.value}>
                          {state.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
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
            <Button variant="outline" onClick={closeDialog} disabled={Boolean(handlingId || returningId)}>
              Cancel
            </Button>
            {actionItem?.rugId ? (
              <Button variant="outline" onClick={() => void handleReturnToWorkflow()} disabled={Boolean(handlingId || returningId)}>
                {returningId ? "Returning..." : "Return to workflow"}
              </Button>
            ) : null}
            <Button onClick={() => void handleMarkHandled()} disabled={Boolean(handlingId || returningId)}>
              {handlingId ? "Saving..." : "Mark handled"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
