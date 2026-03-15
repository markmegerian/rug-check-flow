import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useRug, useUpdateRugNotes, useInvalidateRugs } from "@/hooks/useRugs";
import { PRODUCTION_STAGES } from "@/data/production";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

interface RugDetailSheetProps {
  rugId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_COLORS: Record<string, string> = {
  checked_in: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_production: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  picked_up: "bg-muted text-muted-foreground",
};

export function RugDetailSheet({ rugId, open, onOpenChange }: RugDetailSheetProps) {
  const { data: rug, isLoading } = useRug(open ? rugId : null);
  const updateNotes = useUpdateRugNotes();
  const invalidateRugs = useInvalidateRugs();
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);

  useEffect(() => {
    if (rug) {
      setNotes(rug.notes ?? "");
      setNotesDirty(false);
    }
  }, [rug]);

  const handleSaveNotes = async () => {
    if (!rugId) return;
    try {
      await updateNotes.mutateAsync({ id: rugId, notes });
      setNotesDirty(false);
      toast({ title: "Notes saved" });
    } catch (err) {
      toast({ title: "Failed to save notes", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const handleAdvanceStage = async () => {
    if (!rug) return;
    const idx = PRODUCTION_STAGES.findIndex((s) => s.id === rug.status);
    if (idx < 0 || idx >= PRODUCTION_STAGES.length - 1) return;
    const nextStage = PRODUCTION_STAGES[idx + 1].id;
    const updates: Record<string, string> = { status: nextStage };
    if (nextStage === "ready") updates.completed_at = new Date().toISOString();
    if (nextStage === "picked_up") updates.picked_up_at = new Date().toISOString();

    const { error } = await supabase.from("rugs").update(updates).eq("id", rug.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }
    invalidateRugs();
    toast({ title: `Advanced to ${PRODUCTION_STAGES[idx + 1].label}` });
  };

  const stageIndex = rug ? PRODUCTION_STAGES.findIndex((s) => s.id === rug.status) : -1;
  const isLastStage = stageIndex === PRODUCTION_STAGES.length - 1;
  const stageLabel = PRODUCTION_STAGES.find((s) => s.id === rug?.status)?.label ?? rug?.status;

  const timeline = rug
    ? [
        { label: "Checked In", date: rug.checked_in_at },
        { label: "Completed", date: rug.completed_at },
        { label: "Picked Up", date: rug.picked_up_at },
      ]
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {rug ? (
              <>
                <span className="font-mono">{rug.tag}</span>
                <Badge className={STATUS_COLORS[rug.status] ?? ""}>
                  {stageLabel}
                </Badge>
              </>
            ) : (
              "Rug Detail"
            )}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !rug ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Rug not found.</p>
        ) : (
          <div className="space-y-5 pt-4">
            {/* Client */}
            {rug.client_name && (
              <p className="text-sm text-muted-foreground">{rug.client_name}</p>
            )}

            {/* Photo */}
            {rug.photo_url && (
              <img
                src={rug.photo_url}
                alt={`Rug ${rug.tag}`}
                className="w-full rounded-lg border object-cover max-h-48"
              />
            )}

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Size</p>
                <p>{rug.size_length ?? "?"}×{rug.size_width ?? "?"} ft</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Description</p>
                <p>{rug.description || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Check-in Date</p>
                <p>{new Date(rug.checked_in_at).toLocaleDateString()}</p>
              </div>
            </div>

            <Separator />

            {/* Services */}
            {rug.services.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Services</h4>
                <div className="space-y-1.5">
                  {rug.services.map((s, i) => {
                    const edgeLabel = s.edges && s.edges.length > 0 && s.edges.length < 4
                      ? ` (${s.edges.map(e => e === "end1" ? "E1" : e === "end2" ? "E2" : e === "side1" ? "S1" : "S2").join("+")})`
                      : "";
                    return (
                      <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                        <span>{s.name}{edgeLabel}</span>
                        <span className="text-muted-foreground">${s.line_total.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <Separator />

            {/* Timeline */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h4>
              <div className="space-y-2">
                {timeline.map((step, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${step.date ? "bg-primary" : "bg-muted-foreground/30"}`} />
                    <span className={step.date ? "text-foreground" : "text-muted-foreground/50"}>
                      {step.label}
                    </span>
                    {step.date && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(step.date).toLocaleString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Notes */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</h4>
              <Textarea
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                placeholder="Add notes about this rug..."
                rows={3}
              />
              {notesDirty && (
                <Button
                  size="sm"
                  onClick={handleSaveNotes}
                  disabled={updateNotes.isPending}
                >
                  <Save className="h-3.5 w-3.5 mr-1" />
                  {updateNotes.isPending ? "Saving..." : "Save Notes"}
                </Button>
              )}
            </div>

            <Separator />

            {/* Actions */}
            {!isLastStage && stageIndex >= 0 && (
              <Button onClick={handleAdvanceStage} className="w-full">
                Advance to {PRODUCTION_STAGES[stageIndex + 1]?.label}
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
