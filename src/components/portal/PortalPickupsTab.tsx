import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { type PortalPickup, type PickupRugEntry } from "@/data/mock-portal";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, Lock, Plus, Truck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { usePortalClient } from "@/hooks/usePortalClient";

const DEFAULT_ROUTE_DAY = "Thursday";
const DEFAULT_REGION = "Westchester";

const DAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const getNextDateForRouteDay = (routeDay: string) => {
  const targetDay = DAY_INDEX[routeDay] ?? 4;
  const today = new Date();
  const diff = (targetDay - today.getDay() + 7) % 7 || 7;
  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + diff);
  return nextDate.toISOString().split("T")[0];
};

type PickupRequestRow = Pick<Tables<"pickup_requests">, "id" | "client_id" | "route_day" | "scheduled_date" | "status" | "notes">;
type PickupRequestItemRow = Pick<Tables<"pickup_request_items">, "id" | "pickup_request_id" | "rug_number" | "rug_type" | "length" | "width" | "is_new">;
type ReadyRugRow = Pick<Tables<"rugs">, "id" | "tag" | "description" | "services">;

type ClientLookupRow = {
  id: string;
  route_day: string;
  address: string;
};

type ReadyRugRow = {
  id: string;
  tag: string;
  description: string;
  services: string[];
};

type PickupInsertResult = { id: string };

export default function PortalPickupsTab() {
  const { toast } = useToast();
  const { clientId, loading: portalClientLoading, errorMessage } = usePortalClient();
  const [readyRugs, setReadyRugs] = useState<Array<{ id: string; rugNumber: string; rugType: string; services: string[] }>>([]);
  const [pickups, setPickups] = useState<PortalPickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [routeDay, setRouteDay] = useState(DEFAULT_ROUTE_DAY);
  const [region, setRegion] = useState(DEFAULT_REGION);

  const readyRugNumbers = useMemo(() => readyRugs.map((r) => r.rugNumber), [readyRugs]);

  const fetchPickups = useCallback(async (activeClientId: string, activeRegion: string) => {
    const { data: reqData, error: reqError } = await supabase
      .from("pickup_requests")
      .select("id, client_id, route_day, scheduled_date, status, notes")
      .eq("client_id", activeClientId)
      .order("scheduled_date", { ascending: true })
      .returns<PickupRequestRow[]>();

    if (reqError) {
      toast({ title: "Failed to load pickup requests", description: reqError.message, variant: "destructive" });
      return;
    }

    const requests = reqData ?? [];
    if (requests.length === 0) {
      setPickups([]);
      return;
    }

    const requestIds = requests.map((r) => r.id);
    const { data: itemData, error: itemError } = await supabase
      .from("pickup_request_items")
      .select("id, pickup_request_id, rug_number, rug_type, length, width, is_new")
      .in("pickup_request_id", requestIds)
      .returns<PickupRequestItemRow[]>();

    if (itemError) {
      toast({ title: "Failed to load pickup items", description: itemError.message, variant: "destructive" });
      return;
    }

    const items = itemData ?? [];

    const mapped: PortalPickup[] = requests.map((req) => {
      const reqItems = items.filter((i) => i.pickup_request_id === req.id);
      return {
        id: req.id,
        date: req.scheduled_date,
        routeDay: req.route_day || DEFAULT_ROUTE_DAY,
        region: activeRegion,
        status: (req.status === "pending" || req.status === "confirmed") ? req.status : "confirmed",
        notes: req.notes ?? "",
        rugNumbers: reqItems.filter((i) => !i.is_new).map((i) => i.rug_number),
        newRugs: reqItems
          .filter((i) => i.is_new)
          .map((i) => ({
            id: i.id,
            label: i.rug_number,
            rugType: i.rug_type ?? "",
            length: Number(i.length ?? 0),
            width: Number(i.width ?? 0),
          })),
      };
    });

    setPickups(mapped);
  }, [toast]);

  useEffect(() => {
    if (portalClientLoading) {
      setLoading(true);
      return;
    }

    if (errorMessage) {
      toast({ title: "No portal access", description: errorMessage, variant: "destructive" });
      setLoading(false);
      setReadyRugs([]);
      setPickups([]);
      return;
    }

    if (!clientId) {
      setLoading(false);
      return;
    }

    const init = async () => {
      setLoading(true);

      const { data: selectedClient, error: clientError } = await supabase
        .from("clients")
        .select("id, route_day, address")
        .eq("id", clientId)
        .maybeSingle();

      if (clientError || !selectedClient?.id) {
        toast({ title: "No client found", description: clientError?.message ?? "Please create at least one client record first.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const derivedRouteDay = selectedClient.route_day || DEFAULT_ROUTE_DAY;
      const derivedRegion = selectedClient.address?.includes("Westchester") ? "Westchester" : DEFAULT_REGION;
      setRouteDay(derivedRouteDay);
      setRegion(derivedRegion);

      const { data: rugRows, error: rugError } = await supabase
        .from("rugs")
        .select("id, tag, description, services")
        .eq("client_id", selectedClient.id)
        .eq("status", "ready")
        .order("checked_in_at", { ascending: false })
        .returns<ReadyRugRow[]>();

      if (rugError) {
        toast({ title: "Failed to load ready rugs", description: rugError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      setReadyRugs((rugRows ?? []).map((r) => ({
        id: r.id,
        rugNumber: r.tag,
        rugType: r.description || "Rug",
        services: r.services ?? [],
      })));

      await fetchPickups(selectedClient.id, derivedRegion);
      setLoading(false);
    };

    init();
  }, [clientId, errorMessage, fetchPickups, portalClientLoading, toast]);

  const handleRequestPickup = async () => {
    if (!clientId) return;

    const scheduledDate = getNextDateForRouteDay(routeDay);

    const insertPayload: TablesInsert<"pickup_requests"> = {
      client_id: clientId,
      route_day: routeDay,
      scheduled_date: scheduledDate,
      status: "pending",
      notes: "",
    };

    const { data: inserted, error } = await supabase
      .from("pickup_requests")
      .insert(insertPayload)
      .select("id")
      .single<Pick<Tables<"pickup_requests">, "id">>();

    if (error || !inserted) {
      toast({ title: "Request failed", description: error?.message ?? "Unknown error", variant: "destructive" });
      return;
    }

    const items: TablesInsert<"pickup_request_items">[] = readyRugNumbers.map((rugNumber) => ({
      pickup_request_id: inserted.id,
      rug_number: rugNumber,
      rug_type: "",
      is_new: false,
    }));

    if (items.length > 0) {
      await supabase.from("pickup_request_items").insert(items);
    }

    await fetchPickups(clientId, region);
    toast({
      title: "Pickup requested",
      description: `Scheduled for ${routeDay} (${new Date(`${scheduledDate}T00:00:00`).toLocaleDateString()}) based on your service route.`,
    });
  };

  const handleSave = async (id: string, updates: Partial<PortalPickup>) => {
    if (!clientId) return;

    const { error: updateErr } = await supabase
      .from("pickup_requests")
      .update({ notes: updates.notes ?? "" })
      .eq("id", id);

    if (updateErr) {
      toast({ title: "Save failed", description: updateErr.message, variant: "destructive" });
      return;
    }

    await supabase.from("pickup_request_items").delete().eq("pickup_request_id", id);

    const readyItems: TablesInsert<"pickup_request_items">[] = (updates.rugNumbers ?? []).map((rugNumber) => ({
      pickup_request_id: id,
      rug_number: rugNumber,
      rug_type: "",
      is_new: false,
    }));

    const newRugItems: TablesInsert<"pickup_request_items">[] = (updates.newRugs ?? []).map((rug) => ({
      pickup_request_id: id,
      rug_number: rug.label,
      rug_type: rug.rugType,
      length: rug.length,
      width: rug.width,
      is_new: true,
    }));

    const insertItems = [...readyItems, ...newRugItems];
    if (insertItems.length > 0) {
      await supabase.from("pickup_request_items").insert(insertItems);
    }

    await fetchPickups(clientId, region);
    toast({ title: "Pickup saved" });
  };

  const handleCancel = async (id: string) => {
    if (!clientId) return;
    await supabase.from("pickup_request_items").delete().eq("pickup_request_id", id);
    await supabase.from("pickup_requests").delete().eq("id", id);
    await fetchPickups(clientId, region);
    toast({ title: "Pickup cancelled" });
  };

  if (portalLoading || loading) {
    return <div className="text-sm text-muted-foreground">Loading pickups…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm flex items-center gap-2 text-muted-foreground">
        <CalendarClock className="h-4 w-4" />
        Service region: <span className="font-medium text-foreground">{region}</span> · Pickup route day: <span className="font-medium text-foreground">{routeDay}</span>
      </div>

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
            <Button size="sm" className="mt-3" onClick={handleRequestPickup} disabled={loading || !clientId}>
              <Truck className="mr-1.5 h-3.5 w-3.5" />
              Request Pickup
            </Button>
          </>
        )}
      </section>

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
                readyRugNumbers={readyRugNumbers}
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
  const [selectedRugs, setSelectedRugs] = useState<string[]>(pickup.rugNumbers);
  const [notes, setNotes] = useState(pickup.notes || "");
  const [newRugs, setNewRugs] = useState<PickupRugEntry[]>(pickup.newRugs);

  const fmtDate = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

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
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">{fmtDate(pickup.date)}</span>
          <span className="text-muted-foreground">{pickup.routeDay} route · {pickup.region}</span>
        </div>

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

        {!locked && (
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => onCancel(pickup.id)}>
              Cancel
            </Button>
            <Button size="sm" className="text-xs" onClick={() => onSave(pickup.id, { rugNumbers: selectedRugs, newRugs, notes })}>
              Save
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground text-xs pt-1">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
