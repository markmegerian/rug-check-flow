import { useState } from "react";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/date-helpers";
import type { PortalPickup } from "@/types/portal";

interface PickupHistoryRowProps {
  pickup: PortalPickup;
  onCancel: (id: string) => void;
}

export function PickupHistoryRow({ pickup, onCancel }: PickupHistoryRowProps) {
  const [open, setOpen] = useState(false);
  const locked = pickup.status === "confirmed";
  const dateStr = formatShortDate(pickup.date);
  const totalRugs = pickup.newRugs.length;

  return (
    <div className="rounded-2xl border border-border/70 bg-card/90 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="font-medium text-foreground">{dateStr}</span>
        <span className="text-sm text-muted-foreground">
          {totalRugs} rug{totalRugs !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1.5">
          {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground capitalize">{pickup.status}</span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t space-y-2.5">
          <div className="text-sm text-muted-foreground pt-2 space-y-1.5">
            {pickup.newRugs.length > 0 && (
              <p><strong className="text-foreground">Rugs:</strong> {pickup.newRugs.map((r) => r.label || "Unnamed").join(", ")}</p>
            )}
            {pickup.notes && <p><strong className="text-foreground">Notes:</strong> {pickup.notes}</p>}
          </div>
          {!locked && (
            <Button variant="outline" size="sm" onClick={() => onCancel(pickup.id)}>
              Cancel pickup
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
