import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DisputeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: "delivery" | "pickup";
  onDispute: (disputeType: "refused_delivery" | "post_delivery_claim") => void;
}

export function DisputeDialog({ open, onOpenChange, phase, onDispute }: DisputeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Dispute</DialogTitle>
          <DialogDescription>Select the type of dispute for this item.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Button
            className="w-full"
            variant="outline"
            disabled={phase === "pickup"}
            onClick={() => onDispute("refused_delivery")}
          >
            Refused Delivery
          </Button>
          <Button
            className="w-full"
            variant="outline"
            onClick={() => onDispute("post_delivery_claim")}
          >
            Post-Delivery Claim
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
