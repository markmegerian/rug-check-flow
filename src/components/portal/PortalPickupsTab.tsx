import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
    toast({ title: "Pickup created", description: "Edit the details below." });
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
      {/* Ready for pickup */}
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Ready for Pickup · {readyRugs.length}
        </h3>
        {readyRugs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rugs ready right now.</p>
        ) : (
          <>
            <div className="rounded-lg border bg-background divide-y">
              {readyRugs.map((rug) => (
                <div key={rug.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{rug.rugNumber}</span>
                    <span className="text-muted-foreground">{rug.rugType}</span>
                    <span className="text-muted-foreground hidden sm:inline">·</span>
                    <span className="text-muted-foreground text-xs hidden sm:inline">{rug.services.join(", ")}</span>
                  </div>
                </div>
              ))}
            </div>
            <Button size="sm" className="mt-3" onClick={handleRequestPickup}>
              <Truck className="mr-1.5 h-3.5 w-3.5" />
              Request Pickup
            </Button>
          </>
        )}
      </section>

      {/* Pickup requests */}
      {pickups.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Requests
          </h3>
          <div className="space-y-3">
            {pickups.map((pickup) => (
              <PickupCard
                key={pickup.id}
                pickup={pickup}
                readyRugNumbers={readyRugs.map((r) => r.rugNumber)}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ──────────────────────────────── */

function PickupCard({
  pickup,
  readyRugNumbers,
  onSave,
  onCancel,
}: {
  pickup: PortalPickup;
  readyRugNumbers: string[];
  onSave: (id: string, updates: Partial<PortalPickup>) => void;
  onCancel: (id: string) => void;
}) {
  const locked = pickup.status === "confirmed";
  const [date, setDate] = useState(pickup.date);
  const [selectedRugs, setSelectedRugs] = useState<string[]>(pickup.rugNumbers);
  const [notes, setNotes] = useState(pickup.notes || "");
  const [newRugs, setNewRugs] = useState<PickupRugEntry[]>(pickup.newRugs);

  const fmtDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const toggleRug = (rn: string) =>
    setSelectedRugs((prev) => (prev.includes(rn) ? prev.filter((r) => r !== rn) : [...prev, rn]));

  const addNewRug = () =>
    setNewRugs((prev) => [...prev, { id: `nr-${Date.now()}`, label: "", rugType: "", length: 0, width: 0 }]);

  const updateNewRug = (id: string, field: keyof PickupRugEntry, value: string | number) =>
    setNewRugs((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const removeNewRug = (id: string) => setNewRugs((prev) => prev.filter((r) => r.id !== id));

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      {locked && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted text-xs text-muted-foreground border-b">
          <Lock className="h-3 w-3" />
          Confirmed — no longer editable
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{fmtDate(pickup.date)}</span>
          {!locked && (
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40 text-xs" />
          )}
        </div>

        {/* Ready rugs selection */}
        {readyRugNumbers.length > 0 && (
          <FieldRow label="Ready rugs">
            {locked ? (
              <span className="text-sm">{pickup.rugNumbers.join(", ") || "—"}</span>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {readyRugNumbers.map((rn) => (
                  <label key={rn} className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <Checkbox checked={selectedRugs.includes(rn)} onCheckedChange={() => toggleRug(rn)} />
                    {rn}
                  </label>
                ))}
              </div>
            )}
          </FieldRow>
        )}

        {/* New rugs */}
        <FieldRow label="Additional rugs">
          {locked ? (
            newRugs.length > 0 ? (
              <div className="space-y-1">
                {newRugs.map((r) => (
                  <span key={r.id} className="text-sm block">
                    {r.label || "Unnamed"} · {r.rugType} · {r.length}×{r.width} ft
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )
          ) : (
            <div className="space-y-2 w-full">
              {newRugs.map((rug) => (
                <div key={rug.id} className="flex items-center gap-2">
                  <Input
                    placeholder="Name"
                    value={rug.label}
                    onChange={(e) => updateNewRug(rug.id, "label", e.target.value)}
                    className="h-8 flex-[2] min-w-0"
                  />
                  <Input
                    placeholder="Type"
                    value={rug.rugType}
                    onChange={(e) => updateNewRug(rug.id, "rugType", e.target.value)}
                    className="h-8 flex-1 min-w-0"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <Input
                      type="number"
                      placeholder="L"
                      min={0}
                      value={rug.length || ""}
                      onChange={(e) => updateNewRug(rug.id, "length", Number(e.target.value))}
                      className="h-8 w-14 text-center"
                    />
                    <span className="text-muted-foreground text-xs">×</span>
                    <Input
                      type="number"
                      placeholder="W"
                      min={0}
                      value={rug.width || ""}
                      onChange={(e) => updateNewRug(rug.id, "width", Number(e.target.value))}
                      className="h-8 w-14 text-center"
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeNewRug(rug.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <button
                onClick={addNewRug}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3 w-3" /> Add rug
              </button>
            </div>
          )}
        </FieldRow>

        {/* Notes */}
        <FieldRow label="Notes">
          {locked ? (
            <span className="text-sm">{pickup.notes || "—"}</span>
          ) : (
            <Input
              placeholder="Optional notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-8"
            />
          )}
        </FieldRow>

        {/* Actions */}
        {!locked && (
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => onCancel(pickup.id)}>
              Cancel
            </Button>
            <Button size="sm" className="text-xs" onClick={() => onSave(pickup.id, { date, rugNumbers: selectedRugs, newRugs, notes })}>
              Save
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground text-xs pt-1">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
