import React, { useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, ArrowRight, CheckCircle2, Lock, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import SignatureCanvas from "@/components/driver/SignatureCanvas";
import { DRIVER_PICKUPS, type DriverPickup } from "@/data/mock-driver";

const DriverPortal: React.FC = () => {
  const [pickups, setPickups] = useState<DriverPickup[]>(() =>
    DRIVER_PICKUPS.map((p) => ({ ...p, rugs: p.rugs.map((r) => ({ ...r })) }))
  );
  const [activePickupId, setActivePickupId] = useState<string | null>(null);

  const assigned = pickups.filter((p) => p.status === "assigned");
  const completed = pickups.filter((p) => p.status === "completed");
  const activePickup = activePickupId ? pickups.find((p) => p.id === activePickupId) : null;

  const updatePickup = (id: string, updater: (p: DriverPickup) => DriverPickup) => {
    setPickups((prev) => prev.map((p) => (p.id === id ? updater({ ...p, rugs: p.rugs.map((r) => ({ ...r })) }) : p)));
  };

  const toggleVerified = (pickupId: string, rugIndex: number) => {
    updatePickup(pickupId, (p) => {
      p.rugs[rugIndex].verified = !p.rugs[rugIndex].verified;
      return p;
    });
  };

  const setRugNotes = (pickupId: string, rugIndex: number, notes: string) => {
    updatePickup(pickupId, (p) => {
      p.rugs[rugIndex].notes = notes;
      return p;
    });
  };

  const setSignature = (pickupId: string, dataUrl: string | null) => {
    updatePickup(pickupId, (p) => ({ ...p, signatureDataUrl: dataUrl || undefined }));
  };

  const completePickup = (pickupId: string) => {
    updatePickup(pickupId, (p) => ({
      ...p,
      status: "completed",
      completedAt: new Date().toISOString(),
    }));
    toast({ title: "Pickup completed", description: "Record has been locked." });
  };

  // List view
  if (!activePickup) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 bg-primary text-primary-foreground p-4">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            <h1 className="text-lg font-semibold">RugBoost Driver</h1>
          </div>
        </header>
        <main className="p-4 space-y-6 max-w-lg mx-auto">
          <section>
            <h2 className="text-base font-semibold mb-3">Assigned Pickups ({assigned.length})</h2>
            {assigned.length === 0 && <p className="text-sm text-muted-foreground">No assigned pickups.</p>}
            <div className="space-y-3">
              {assigned.map((pickup) => (
                <div key={pickup.id} className="rounded-lg border bg-card p-4 space-y-2">
                  <p className="font-medium text-base">{pickup.clientName}</p>
                  <p className="text-sm text-muted-foreground">{pickup.clientAddress}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(pickup.date), "MMM d")} — {pickup.rugs.length} rug{pickup.rugs.length !== 1 ? "s" : ""}
                  </p>
                  <Button className="w-full min-h-[44px]" onClick={() => setActivePickupId(pickup.id)}>
                    Start Verification <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>

          {completed.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-3 text-muted-foreground">Completed</h2>
              <div className="space-y-3">
                {completed.map((pickup) => (
                  <div
                    key={pickup.id}
                    className="rounded-lg border bg-muted/50 p-4 space-y-1 cursor-pointer"
                    onClick={() => setActivePickupId(pickup.id)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-muted-foreground">{pickup.clientName}</p>
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(pickup.date), "MMM d")} — {pickup.rugs.length} rug{pickup.rugs.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    );
  }

  // Verification / locked view
  const locked = activePickup.status === "completed";
  const allVerified = activePickup.rugs.every((r) => r.verified);
  const hasSignature = !!activePickup.signatureDataUrl;
  const canComplete = allVerified && hasSignature;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground p-4">
        <div className="flex items-center gap-3">
          <button className="min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2" onClick={() => setActivePickupId(null)}>
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold truncate">{activePickup.clientName}</h1>
        </div>
      </header>
      <main className="p-4 space-y-4 max-w-lg mx-auto">
        {locked && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Pickup completed on {format(new Date(activePickup.completedAt!), "M/d/yyyy")} at{" "}
              {format(new Date(activePickup.completedAt!), "h:mm a")}. Record is locked.
            </AlertDescription>
          </Alert>
        )}

        {activePickup.rugs.map((rug, i) => (
          <div key={rug.rugNumber} className="rounded-lg border bg-card p-4 space-y-3">
            <div>
              <p className="font-medium text-base">
                {rug.rugNumber} &nbsp;{rug.rugType} &nbsp;{rug.length}×{rug.width}
              </p>
              <p className="text-sm text-muted-foreground">{rug.services.join(", ")}</p>
            </div>

            {locked ? (
              <div className="space-y-1">
                <p className="text-sm flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Verified
                </p>
                <p className="text-sm text-muted-foreground">Notes: {rug.notes || "—"}</p>
              </div>
            ) : (
              <>
                <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
                  <Checkbox
                    checked={rug.verified}
                    onCheckedChange={() => toggleVerified(activePickup.id, i)}
                    className="h-5 w-5"
                  />
                  <span className="text-sm font-medium">Verified</span>
                </label>
                <div>
                  <label className="text-sm text-muted-foreground">Notes</label>
                  <Input
                    value={rug.notes}
                    onChange={(e) => setRugNotes(activePickup.id, i, e.target.value)}
                    placeholder="Optional notes…"
                    className="mt-1 min-h-[44px]"
                  />
                </div>
              </>
            )}
          </div>
        ))}

        {locked ? (
          activePickup.signatureDataUrl && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Signature</p>
              <img src={activePickup.signatureDataUrl} alt="Signature" className="w-full h-[150px] rounded-md border border-input bg-background object-contain" />
            </div>
          )
        ) : (
          <>
            <SignatureCanvas
              onSignatureChange={(url) => setSignature(activePickup.id, url)}
              disabled={false}
            />
            <div className="space-y-2 pt-2">
              <Button className="w-full min-h-[48px] text-base" disabled={!canComplete} onClick={() => completePickup(activePickup.id)}>
                Complete Pickup
              </Button>
              {!canComplete && (
                <p className="text-xs text-muted-foreground text-center">
                  {!allVerified && "All rugs must be verified. "}
                  {!hasSignature && "Signature is required."}
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default DriverPortal;
