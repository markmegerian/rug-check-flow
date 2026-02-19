import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PORTAL_RUGS, PORTAL_PICKUPS, type PortalPickup } from "@/data/mock-portal";
import { useToast } from "@/hooks/use-toast";
import { Truck, Lock } from "lucide-react";

export default function PortalPickupsTab() {
  const { toast } = useToast();
  const readyRugs = PORTAL_RUGS.filter((r) => r.status === "ready");
  const [pickups, setPickups] = useState<PortalPickup[]>([...PORTAL_PICKUPS]);

  const handleRequestPickup = () => {
    const newPickup: PortalPickup = {
      id: `pk-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      rugNumbers: readyRugs.map((r) => r.rugNumber),
      status: "pending",
      notes: "",
    };
    setPickups((prev) => [...prev, newPickup]);
    toast({ title: "Pickup created", description: "Edit the details below and save." });
  };

  const handleSave = (id: string, updates: Partial<PortalPickup>) => {
    setPickups((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    toast({ title: "Pickup saved" });
  };

  const handleCancel = (id: string) => {
    setPickups((prev) => prev.filter((p) => p.id !== id));
    toast({ title: "Pickup cancelled" });
  };

  return (
    <div className="space-y-6">
      {/* Ready for Pickup */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Ready for Pickup ({readyRugs.length} rug{readyRugs.length !== 1 ? "s" : ""})
        </h3>
        {readyRugs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rugs ready for pickup right now.</p>
        ) : (
          <div className="space-y-2">
            {readyRugs.map((rug) => (
              <div key={rug.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium">{rug.rugNumber}</span>
                  <span className="text-muted-foreground">{rug.rugType}</span>
                  <span className="text-muted-foreground truncate max-w-[200px]">{rug.services.join(", ")}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Ready since {new Date(rug.checkedInDate).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                </span>
              </div>
            ))}
            <Button className="mt-2" onClick={handleRequestPickup}>
              <Truck className="mr-2 h-4 w-4" />
              Request Pickup
            </Button>
          </div>
        )}
      </div>

      {/* Pickup Requests */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Pickup Requests</h3>
        {pickups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pickups scheduled.</p>
        ) : (
          <div className="space-y-4">
            {pickups.map((pickup) => (
              <PickupCard
                key={pickup.id}
                pickup={pickup}
                readyRugs={readyRugs.map((r) => r.rugNumber)}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PickupCard({
  pickup,
  readyRugs,
  onSave,
  onCancel,
}: {
  pickup: PortalPickup;
  readyRugs: string[];
  onSave: (id: string, updates: Partial<PortalPickup>) => void;
  onCancel: (id: string) => void;
}) {
  const locked = pickup.status === "confirmed";
  const [date, setDate] = useState(pickup.date);
  const [selectedRugs, setSelectedRugs] = useState<string[]>(pickup.rugNumbers);
  const [notes, setNotes] = useState(pickup.notes || "");

  const formattedDate = new Date(pickup.date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const toggleRug = (rugNumber: string) => {
    setSelectedRugs((prev) =>
      prev.includes(rugNumber) ? prev.filter((r) => r !== rugNumber) : [...prev, rugNumber]
    );
  };

  return (
    <div className="rounded-md border">
      {locked && (
        <Alert className="rounded-b-none border-b">
          <Lock className="h-4 w-4" />
          <AlertDescription>
            This pickup has been confirmed and can no longer be edited.
          </AlertDescription>
        </Alert>
      )}
      <div className="p-4 space-y-3">
        <h4 className="text-sm font-semibold">Pickup Request — {formattedDate}</h4>

        {/* Date */}
        <div className="flex items-center gap-3 text-sm">
          <span className="w-16 text-muted-foreground">Date</span>
          {locked ? (
            <span>{new Date(pickup.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          ) : (
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          )}
        </div>

        {/* Rugs */}
        <div className="flex items-start gap-3 text-sm">
          <span className="w-16 text-muted-foreground pt-0.5">Rugs</span>
          {locked ? (
            <span>{pickup.rugNumbers.join(", ")}</span>
          ) : (
            <div className="flex flex-wrap gap-3">
              {readyRugs.map((rn) => (
                <label key={rn} className="flex items-center gap-1.5 cursor-pointer">
                  <Checkbox
                    checked={selectedRugs.includes(rn)}
                    onCheckedChange={() => toggleRug(rn)}
                  />
                  <span>{rn}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="flex items-center gap-3 text-sm">
          <span className="w-16 text-muted-foreground">Notes</span>
          {locked ? (
            <span>{pickup.notes || "—"}</span>
          ) : (
            <Input
              type="text"
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="flex-1"
            />
          )}
        </div>

        {/* Actions */}
        {!locked && (
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => onCancel(pickup.id)}>
              Cancel Request
            </Button>
            <Button size="sm" onClick={() => onSave(pickup.id, { date, rugNumbers: selectedRugs, notes })}>
              Save
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
