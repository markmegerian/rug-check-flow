import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle } from "lucide-react";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";

interface QaCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rugId: string;
  rugTag: string;
  currentStage: string;
  onComplete: (passed: boolean) => void;
}

export function QaCheckDialog({
  open,
  onOpenChange,
  rugId,
  rugTag,
  currentStage,
  onComplete,
}: QaCheckDialogProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (passed: boolean) => {
    if (!passed && !notes.trim()) {
      toast({
        title: "Notes required",
        description: "Please provide notes explaining the failure.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    const { error } = await supabaseExtended.from("qa_checks").insert({
      rug_id: rugId,
      stage: currentStage,
      passed,
      notes: notes.trim() || null,
      checked_by: user?.id ?? null,
    });
    setSubmitting(false);

    if (error) {
      toast({
        title: "QA check failed to save",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    if (!passed) {
      toast({
        title: "QA Check Failed",
        description: `${rugTag} did not pass QA. It will remain in "${currentStage}".`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "QA Check Passed",
        description: `${rugTag} passed QA and will advance.`,
      });
    }

    setNotes("");
    onOpenChange(false);
    onComplete(passed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>QA Check &mdash; {rugTag}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Current stage: <span className="font-medium text-foreground">{currentStage}</span>
        </p>

        <Textarea
          placeholder="Notes (required when failing)..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />

        <div className="flex gap-3 justify-end pt-2">
          <Button
            variant="destructive"
            disabled={submitting}
            onClick={() => handleSubmit(false)}
            className="gap-1.5"
          >
            <XCircle className="h-4 w-4" />
            Fail
          </Button>
          <Button
            disabled={submitting}
            onClick={() => handleSubmit(true)}
            className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle2 className="h-4 w-4" />
            Pass
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
