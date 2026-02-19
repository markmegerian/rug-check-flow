import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PORTAL_RUGS, PORTAL_PICKUPS, type PortalPickup, type PickupRugEntry } from "@/data/mock-portal";
import { useToast } from "@/hooks/use-toast";
import { Truck, Lock, Plus, X } from "lucide-react";

export default function PortalPickupsTab() {
  const { toast } = useToast();
  const readyRugs = PORTAL_RUGS.filter((r) => r.status === "ready");
  const [pickups, setPickups] = useState<PortalPickup[]>([...PORTAL_PICKUPS]);

  const handleRequestPickup = () => {
    const newPickup: PortalPickup = {
      id: `pk-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      rugNumbers: readyRugs.map((r) => r.rugNumber),
      newRugs: [],
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
  const [newRugs, setNewRugs] = useState<PickupRugEntry[]>(pickup.newRugs);

  const formattedDate = new Date(pickup.date + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const toggleRug = (rugNumber: string) => {
    setSelectedRugs((prev) =>
      prev.includes(rugNumber) ? prev.filter((r) => r !== rugNumber) : [...prev, rugNumber]
    );
  };

  const addNewRug = () => {
    setNewRugs((prev) => [
      ...prev,
      { id: `nr-${Date.now()}`, label: "", rugType: "", length: 0, width: 0 },
    ]);
  };

  const updateNewRug = (id: string, field: keyof PickupRugEntry, value: string | number) => {
    setNewRugs((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const removeNewRug = (id: string) => {
    setNewRugs((prev) => prev.filter((r) => r.id !== id));
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
          <span className="w-20 text-muted-foreground shrink-0">Date</span>
          {locked ? (
            <span>{new Date(pickup.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          ) : (
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
          )}
        </div>

        {/* Existing ready rugs */}
        {readyRugs.length > 0 && (
          <div className="flex items-start gap-3 text-sm">
            <span className="w-20 text-muted-foreground pt-0.5 shrink-0">Ready rugs</span>
            {locked ? (
              <span>{pickup.rugNumbers.join(", ") || "—"}</span>
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
        )}

        {/* New rugs to add */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-sm">
            <span className="w-20 text-muted-foreground shrink-0">New rugs</span>
            {!locked && (
              <Button variant="outline" size="sm" onClick={addNewRug} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Add Rug
              </Button>
            )}
          </div>

          {newRugs.length > 0 && (
            <div className="ml-0 sm:ml-[calc(5rem+0.75rem)] space-y-2">
              {newRugs.map((rug) => (
                <div key={rug.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm">
                  {locked ? (
                    <>
                      <span className="font-medium">{rug.label || "Unnamed"}</span>
                      <span className="text-muted-foreground">{rug.rugType}</span>
                      <span className="text-muted-foreground">{rug.length}×{rug.width} ft</span>
                    </>
                  ) : (
                    <>
                      <Input
                        placeholder="Name / label"
                        value={rug.label}
                        onChange={(e) => updateNewRug(rug.id, "label", e.target.value)}
                        className="h-8 w-32"
                      />
                      <Input
                        placeholder="Type"
                        value={rug.rugType}
                        onChange={(e) => updateNewRug(rug.id, "rugType", e.target.value)}
                        className="h-8 w-24"
                      />
                      <Input
                        type="number"
                        placeholder="L"
                        min={0}
                        value={rug.length || ""}
                        onChange={(e) => updateNewRug(rug.id, "length", Number(e.target.value))}
                        className="h-8 w-16"
                      />
                      <span className="text-muted-foreground">×</span>
                      <Input
                        type="number"
                        placeholder="W"
                        min={0}
                        value={rug.width || ""}
                        onChange={(e) => updateNewRug(rug.id, "width", Number(e.target.value))}
                        className="h-8 w-16"
                      />
                      <span className="text-muted-foreground text-xs">ft</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeNewRug(rug.id)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {locked && newRugs.length === 0 && (
            <span className="ml-[calc(5rem+0.75rem)] text-sm text-muted-foreground">—</span>
          )}
        </div>

        {/* Notes */}
        <div className="flex items-center gap-3 text-sm">
          <span className="w-20 text-muted-foreground shrink-0">Notes</span>
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
            <Button size="sm" onClick={() => onSave(pickup.id, { date, rugNumbers: selectedRugs, newRugs, notes })}>
              Save
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
