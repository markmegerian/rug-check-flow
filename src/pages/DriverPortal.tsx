import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Lock, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import SignatureCanvas from "@/components/driver/SignatureCanvas";
import { useAuth } from "@/contexts/AuthContext";
import { EmptyState, LoadingState } from "@/components/states/PageState";
import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";
import { canDriverCompletePickup, type PickupRequestStatus } from "@/lib/workflow-guards";
import type { Tables } from "@/integrations/supabase/types";

type PickupStatus = PickupRequestStatus;

type DriverPickupRequestRow = Pick<
  ExtendedTableRow<"pickup_requests">,
  "id" | "scheduled_date" | "status" | "completed_at" | "signature_data_url"
> & {
  clients: Pick<Tables<"clients">, "name" | "address"> | null;
};

type DriverPickupItemRow = Pick<
  ExtendedTableRow<"pickup_request_items">,
  "id" | "pickup_request_id" | "rug_number" | "rug_type" | "length" | "width" | "verified" | "driver_notes" | "driver_photo_urls"
>;

type DriverPickup = {
  id: string;
  clientName: string;
  clientAddress: string;
  date: string;
  status: PickupStatus;
  completedAt?: string;
  signatureDataUrl?: string;
  rugs: {
    id: string;
    rugNumber: string;
    rugType: string;
    length: number;
    width: number;
    verified: boolean;
    notes: string;
    photos: string[];
  }[];
};

const DriverPortal: React.FC = () => {
  const { user } = useAuth();
  const [pickups, setPickups] = useState<DriverPickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePickupId, setActivePickupId] = useState<string | null>(null);

  const fetchPickups = useCallback(async () => {
    if (!user?.id) {
      setPickups([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: reqData, error: reqErr } = await supabaseExtended
      .from("pickup_requests")
      .select("id, scheduled_date, status, completed_at, signature_data_url, clients(name,address)")
      .eq("assigned_driver_id", user.id)
      .in("status", ["assigned", "completed"])
      .order("scheduled_date", { ascending: true });

    if (reqErr) {
      toast({ title: "Failed to load pickups", description: reqErr.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const requests = (reqData ?? []) as unknown as DriverPickupRequestRow[];
    const requestIds = requests.map((r) => r.id);

    const { data: itemData } = requestIds.length === 0
      ? { data: [] }
      : await supabaseExtended
          .from("pickup_request_items")
          .select("id, pickup_request_id, rug_number, rug_type, length, width, verified, driver_notes, driver_photo_urls")
          .in("pickup_request_id", requestIds);

    const items = (itemData ?? []) as DriverPickupItemRow[];

    const mapped: DriverPickup[] = requests.map((r) => ({
      id: r.id,
      clientName: r.clients?.name ?? "Unknown",
      clientAddress: r.clients?.address ?? "",
      date: r.scheduled_date,
      status: r.status,
      completedAt: r.completed_at ?? undefined,
      signatureDataUrl: r.signature_data_url ?? undefined,
      rugs: items
        .filter((i) => i.pickup_request_id === r.id)
        .map((i) => ({
          id: i.id,
          rugNumber: i.rug_number,
          rugType: i.rug_type || "Rug",
          length: Number(i.length ?? 0),
          width: Number(i.width ?? 0),
          verified: Boolean(i.verified),
          notes: i.driver_notes || "",
          photos: i.driver_photo_urls ?? [],
        })),
    }));

    setPickups(mapped);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchPickups();
  }, [fetchPickups]);

  const assigned = useMemo(() => pickups.filter((p) => p.status === "assigned"), [pickups]);
  const completed = useMemo(() => pickups.filter((p) => p.status === "completed"), [pickups]);
  const activePickup = activePickupId ? pickups.find((p) => p.id === activePickupId) : null;

  const updateLocalPickup = (id: string, updater: (p: DriverPickup) => DriverPickup) => {
    setPickups((prev) => prev.map((p) => (p.id === id ? updater({ ...p, rugs: p.rugs.map((r) => ({ ...r })) }) : p)));
  };

  const toggleVerified = async (pickupId: string, rugId: string) => {
    const pickup = pickups.find((p) => p.id === pickupId);
    const rug = pickup?.rugs.find((r) => r.id === rugId);
    if (!pickup || !rug || pickup.status === "completed") return;

    const next = !rug.verified;
    const { error } = await supabaseExtended
      .from("pickup_request_items")
      .update({ verified: next })
      .eq("id", rugId);

    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
      return;
    }

    updateLocalPickup(pickupId, (p) => {
      p.rugs = p.rugs.map((r) => (r.id === rugId ? { ...r, verified: next } : r));
      return p;
    });
  };

  const setRugNotes = async (pickupId: string, rugId: string, notes: string) => {
    const { error } = await supabaseExtended
      .from("pickup_request_items")
      .update({ driver_notes: notes })
      .eq("id", rugId);

    if (error) {
      toast({ title: "Notes update failed", description: error.message, variant: "destructive" });
      return;
    }

    updateLocalPickup(pickupId, (p) => {
      p.rugs = p.rugs.map((r) => (r.id === rugId ? { ...r, notes } : r));
      return p;
    });
  };

  const addPickupPhoto = async (pickupId: string, rugId: string, file: File) => {
    const path = `${pickupId}/${rugId}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const { error: uploadError } = await supabaseExtended.storage.from("pickup-photos").upload(path, file, { upsert: false });
    if (uploadError) {
      toast({ title: "Photo upload failed", description: uploadError.message, variant: "destructive" });
      return;
    }

    const { data: publicUrl } = supabaseExtended.storage.from("pickup-photos").getPublicUrl(path);
    const pickup = pickups.find((p) => p.id === pickupId);
    const rug = pickup?.rugs.find((item) => item.id === rugId);
    const nextPhotos = [...(rug?.photos ?? []), publicUrl.publicUrl];

    const { error: updateError } = await supabaseExtended
      .from("pickup_request_items")
      .update({ driver_photo_urls: nextPhotos })
      .eq("id", rugId);

    if (updateError) {
      toast({ title: "Photo save failed", description: updateError.message, variant: "destructive" });
      return;
    }

    updateLocalPickup(pickupId, (p) => {
      p.rugs = p.rugs.map((r) => (r.id === rugId ? { ...r, photos: nextPhotos } : r));
      return p;
    });
  };

  const removePickupPhoto = async (pickupId: string, rugId: string, photoUrl: string) => {
    const pickup = pickups.find((p) => p.id === pickupId);
    const rug = pickup?.rugs.find((item) => item.id === rugId);
    const nextPhotos = (rug?.photos ?? []).filter((url) => url !== photoUrl);

    const { error } = await supabaseExtended
      .from("pickup_request_items")
      .update({ driver_photo_urls: nextPhotos })
      .eq("id", rugId);

    if (error) {
      toast({ title: "Photo removal failed", description: error.message, variant: "destructive" });
      return;
    }

    updateLocalPickup(pickupId, (p) => {
      p.rugs = p.rugs.map((r) => (r.id === rugId ? { ...r, photos: nextPhotos } : r));
      return p;
    });
  };

  const setSignature = async (pickupId: string, dataUrl: string | null) => {
    const { error } = await supabaseExtended
      .from("pickup_requests")
      .update({ signature_data_url: dataUrl })
      .eq("id", pickupId);

    if (error) {
      toast({ title: "Signature update failed", description: error.message, variant: "destructive" });
      return;
    }

    updateLocalPickup(pickupId, (p) => ({ ...p, signatureDataUrl: dataUrl || undefined }));
  };

  const completePickup = async (pickupId: string) => {
    const pickup = pickups.find((p) => p.id === pickupId);
    if (!pickup) return;
    const allVerified = pickup.rugs.every((rug) => rug.verified);
    const hasSignature = Boolean(pickup.signatureDataUrl);
    if (!canDriverCompletePickup({ status: pickup.status, allVerified, hasSignature })) {
      toast({
        title: "Pickup cannot be completed",
        description: "Assigned pickups require verified rugs and a signature.",
        variant: "destructive",
      });
      return;
    }

    const completedAt = new Date().toISOString();
    const { error } = await supabaseExtended
      .from("pickup_requests")
      .update({ status: "completed", completed_at: completedAt })
      .eq("id", pickupId);

    if (error) {
      toast({ title: "Completion failed", description: error.message, variant: "destructive" });
      return;
    }

    updateLocalPickup(pickupId, (p) => ({ ...p, status: "completed", completedAt }));
    toast({ title: "Pickup completed", description: "Record has been locked." });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <LoadingState title="Loading pickups" description="Preparing your assigned route..." className="w-full max-w-lg" />
      </div>
    );
  }

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
            {assigned.length === 0 && (
              <EmptyState
                className="border-dashed"
                title="No assigned pickups"
                description="New assignments will appear here when dispatch routes work to you."
              />
            )}
            <div className="space-y-3">
              {assigned.map((pickup, i) => (
                <div key={pickup.id} className="rounded-lg border bg-card p-4 space-y-2 shadow-card animate-fade-in-up" style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}>
                  <p className="font-medium text-base">{pickup.clientName}</p>
                  <p className="text-sm text-muted-foreground">{pickup.clientAddress}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(`${pickup.date}T00:00:00`), "MMM d")} — {pickup.rugs.length} rug{pickup.rugs.length !== 1 ? "s" : ""}
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
                  <div key={pickup.id} className="rounded-lg border bg-muted/50 p-4 space-y-1 cursor-pointer" onClick={() => setActivePickupId(pickup.id)}>
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-muted-foreground">{pickup.clientName}</p>
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(`${pickup.date}T00:00:00`), "MMM d")} — {pickup.rugs.length} rug{pickup.rugs.length !== 1 ? "s" : ""}
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
              Pickup completed on {format(new Date(activePickup.completedAt!), "M/d/yyyy")} at {" "}
              {format(new Date(activePickup.completedAt!), "h:mm a")}. Record is locked.
            </AlertDescription>
          </Alert>
        )}

        {activePickup.rugs.map((rug, i) => (
          <div key={rug.id} className="rounded-lg border bg-card p-4 space-y-3 shadow-card animate-fade-in-up" style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}>
            <div>
              <p className="font-medium text-base">
                {rug.rugNumber} &nbsp;{rug.rugType} &nbsp;{rug.length}×{rug.width}
              </p>
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
                  <Checkbox checked={rug.verified} onCheckedChange={() => toggleVerified(activePickup.id, rug.id)} className="h-5 w-5" />
                  <span className="text-sm font-medium">Verified</span>
                </label>
                <div>
                  <label className="text-sm text-muted-foreground">Notes</label>
                  <Input
                    value={rug.notes}
                    onChange={(e) => setRugNotes(activePickup.id, rug.id, e.target.value)}
                    placeholder="Optional notes…"
                    className="mt-1 min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Pickup photos</label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {rug.photos.map((photo) => (
                      <div key={photo} className="relative h-14 w-14 rounded border overflow-hidden">
                        <img src={photo} alt="Pickup evidence" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                          onClick={() => removePickupPhoto(activePickup.id, rug.id, photo)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    <label className="h-14 w-14 rounded border border-dashed flex items-center justify-center text-muted-foreground cursor-pointer hover:text-foreground hover:border-primary">
                      <Camera className="h-4 w-4" />
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void addPickupPhoto(activePickup.id, rug.id, file);
                          }
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
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
            <SignatureCanvas onSignatureChange={(url) => setSignature(activePickup.id, url)} disabled={false} initialDataUrl={activePickup.signatureDataUrl} />
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
