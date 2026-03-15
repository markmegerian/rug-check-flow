import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ExceptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (code: string, notes: string) => void;
}

export function ExceptionDialog({ open, onOpenChange, onSave }: ExceptionDialogProps) {
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");

  const handleSave = () => {
    onSave(code, notes);
    setCode("");
    setNotes("");
  };

  const handleCancel = () => {
    onOpenChange(false);
    setCode("");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Exception</DialogTitle>
          <DialogDescription>Enter exception details for this item.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Exception Code</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g., DAMAGED, MISSING, WRONG_ADDRESS"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details..."
              className="mt-1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!code}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
