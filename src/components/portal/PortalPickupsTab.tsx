import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { type PortalPickup, type PickupRugEntry } from "@/data/mock-portal";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Lock, Plus, Truck, X } from "lucide-react";
import {
  supabaseExtended,
  type ExtendedTableInsert,
  type ExtendedTableRow,
} from "@/integrations/supabase/extended";
import { usePortalClient } from "@/hooks/usePortalClient";
import {
  canPortalEditPickup,
  canRoleTransitionPickupStatus,
  normalizePortalPickupStatus,
} from "@/lib/workflow-guards";
import type { Tables } from "@/integrations/supabase/types";

const DEFAULT_ROUTE_DAY = "Thursday";
const DEFAULT_REGION = "Westchester";

const DAY_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

/** Returns ISO date string YYYY-MM-DD for the next occurrence of routeDay. */
function getNextDateForRouteDay(routeDay: string): string {
  const targetDay = DAY_INDEX[routeDay] ?? 4;
  const today = new Date();
  const diff = (targetDay - today.getDay() + 7) % 7 || 7;
  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + diff);
  const y = nextDate.getFullYear();
  const m = String(nextDate.getMonth() + 1).padStart(2, "0");
  const d = String(nextDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format ISO date string for display; never returns "Invalid Date". */
function formatPickupDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

type PickupRequestRow = {
  id: ExtendedTableRow<"pickup_requests">["id"];
  client_id: ExtendedTableRow<"pickup_requests">["client_id"];
  route_day: ExtendedTableRow<"pickup_requests">["route_day"];
  scheduled_date: ExtendedTableRow<"pickup_requests">["scheduled_date"];
  status: ExtendedTableRow<"pickup_requests">["status"];
  notes: ExtendedTableRow<"pickup_requests">["notes"];
};

type PickupRequestItemRow = {
  id: ExtendedTableRow<"pickup_request_items">["id"];
  pickup_request_id: ExtendedTableRow<"pickup_request_items">["pickup_request_id"];
  rug_number: ExtendedTableRow<"pickup_request_items">["rug_number"];
  rug_type: ExtendedTableRow<"pickup_request_items">["rug_type"];
  length: ExtendedTableRow<"pickup_request_items">["length"];
  width: ExtendedTableRow<"pickup_request_items">["width"];
  is_new: ExtendedTableRow<"pickup_request_items">["is_new"];
  estimate_requested: ExtendedTableRow<"pickup_request_items">["estimate_requested"];
  estimate_request_details: ExtendedTableRow<"pickup_request_items">["estimate_request_details"];
};

type ClientLookupRow = {
  id: Tables<"clients">["id"];
  route_day: Tables<"clients">["route_day"];
  address: Tables<"clients">["address"];
};

type ReadyRugRow = {
  id: Tables<"rugs">["id"];
  tag: Tables<"rugs">["tag"];
  description: Tables<"rugs">["description"];
  services: Tables<"rugs">["services"];
};

export default function PortalPickupsTab() {
  const { toast } = useToast();
  const { clientId, loading: portalClientLoading, errorMessage } = usePortalClient();
  const [readyRugs, setReadyRugs] = useState<Array<{ id: string; rugNumber: string; rugType: string; services: string[] }>>([]);
  const [pickups, setPickups] = useState<PortalPickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [routeDay, setRouteDay] = useState(DEFAULT_ROUTE_DAY);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [requesting, setRequesting] = useState(false);
  const [requestDate, setRequestDate] = useState<string>(() => getNextDateForRouteDay(DEFAULT_ROUTE_DAY));
  const [draftSelectedRugs, setDraftSelectedRugs] = useState<string[]>([]);
  const [draftNewRugs, setDraftNewRugs] = useState<PickupRugEntry[]>([]);
  /** Per known rug (by rug_number): estimate requested + optional details. */
  const [draftEstimateByRug, setDraftEstimateByRug] = useState<Record<string, { requested: boolean; details: string }>>({});
  const [draftNotes, setDraftNotes] = useState("");
  const [supportsEstimateFields, setSupportsEstimateFields] = useState(true);
  const [draftHydratedPickupId, setDraftHydratedPickupId] = useState<string | null>(null);

  const readyRugNumbers = useMemo(() => readyRugs.map((r) => r.rugNumber), [readyRugs]);
  const nextPendingPickup = useMemo(() => pickups.find((p) => p.status === "pending") ?? null, [pickups]);

  const toggleDraftRug = useCallback((rn: string) => {
    setDraftSelectedRugs((prev) => (prev.includes(rn) ? prev.filter((r) => r !== rn) : [...prev, rn]));
  }, []);

  const addDraftRug = useCallback(() => {
    setDraftNewRugs((prev) => [...prev, { id: `nr-${Date.now()}`, label: "", rugType: "", length: 0, width: 0, estimateRequested: false, estimateDetails: "" }]);
  }, []);

  const updateDraftRug = useCallback((id: string, field: keyof PickupRugEntry, value: string | number | boolean) => {
    setDraftNewRugs((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const removeDraftRug = useCallback((id: string) => {
    setDraftNewRugs((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const setDraftEstimateForKnownRug = useCallback((rugNumber: string, requested: boolean, details: string) => {
    setDraftEstimateByRug((prev) => ({ ...prev, [rugNumber]: { requested, details } }));
  }, []);

  useEffect(() => {
    if (!nextPendingPickup) {
      setDraftHydratedPickupId(null);
      return;
    }
    if (draftHydratedPickupId === nextPendingPickup.id) return;
    setDraftSelectedRugs(nextPendingPickup.rugNumbers);
    setDraftNewRugs(nextPendingPickup.newRugs.map((r) => ({ ...r, estimateRequested: r.estimateRequested ?? false, estimateDetails: r.estimateDetails ?? "" })));
    setDraftEstimateByRug(nextPendingPickup.knownRugEstimateRequests ?? {});
    setDraftNotes(nextPendingPickup.notes ?? "");
    setRequestDate(nextPendingPickup.date);
    setDraftHydratedPickupId(nextPendingPickup.id);
  }, [draftHydratedPickupId, nextPendingPickup]);

  const fetchPickups = useCallback(async (activeClientId: string, activeRegion: string) => {
    const { data: reqData, error: reqError } = await supabaseExtended
      .from("pickup_requests")
      .select("id, client_id, route_day, scheduled_date, status, notes")
      .eq("client_id", activeClientId)
      .order("scheduled_date", { ascending: true })
      .limit(150);

    if (reqError) {
      toast({ title: "Failed to load pickups", description: reqError.message, variant: "destructive" });
      return;
    }

    const requests = (reqData ?? []) as PickupRequestRow[];
    if (requests.length === 0) {
      setPickups([]);
      return;
    }

    const requestIds = requests.map((r) => r.id);
    let itemData: PickupRequestItemRow[] | null = null;
    let itemError: { message: string } | null = null;

    if (supportsEstimateFields) {
      const result = await supabaseExtended
        .from("pickup_request_items")
        .select("id, pickup_request_id, rug_number, rug_type, length, width, is_new, estimate_requested, estimate_request_details")
        .in("pickup_request_id", requestIds);
      itemData = (result.data ?? []) as PickupRequestItemRow[];
      itemError = result.error ? { message: result.error.message } : null;
      if (result.error) {
        const fallback = await supabaseExtended
          .from("pickup_request_items")
          .select("id, pickup_request_id, rug_number, rug_type, length, width, is_new")
          .in("pickup_request_id", requestIds);
        itemData = ((fallback.data ?? []) as PickupRequestItemRow[]).map((item) => ({
          ...item,
          estimate_requested: false,
          estimate_request_details: null,
        }));
        itemError = fallback.error ? { message: fallback.error.message } : null;
        if (!fallback.error) setSupportsEstimateFields(false);
      }
    } else {
      const fallback = await supabaseExtended
        .from("pickup_request_items")
        .select("id, pickup_request_id, rug_number, rug_type, length, width, is_new")
        .in("pickup_request_id", requestIds);
      itemData = ((fallback.data ?? []) as PickupRequestItemRow[]).map((item) => ({
        ...item,
        estimate_requested: false,
        estimate_request_details: null,
      }));
      itemError = fallback.error ? { message: fallback.error.message } : null;
    }

    if (itemError) {
      toast({ title: "Failed to load pickup items", description: itemError.message, variant: "destructive" });
      return;
    }

    const items = (itemData ?? []) as PickupRequestItemRow[];
    const mapped: PortalPickup[] = requests.map((req) => {
      const reqItems = items.filter((i) => i.pickup_request_id === req.id);
      return {
        id: req.id,
        date: req.scheduled_date,
        routeDay: req.route_day || DEFAULT_ROUTE_DAY,
        region: activeRegion,
        status: normalizePortalPickupStatus(req.status),
        notes: req.notes ?? "",
        rugNumbers: reqItems.filter((i) => !i.is_new).map((i) => i.rug_number),
        knownRugEstimateRequests: Object.fromEntries(
          reqItems
            .filter((i) => !i.is_new)
            .map((i) => [i.rug_number, { requested: Boolean(i.estimate_requested), details: i.estimate_request_details ?? "" }])
        ),
        newRugs: reqItems
          .filter((i) => i.is_new)
          .map((i) => ({
            id: i.id,
            label: i.rug_number,
            rugType: i.rug_type ?? "",
            length: Number(i.length ?? 0),
            width: Number(i.width ?? 0),
            estimateRequested: Boolean(i.estimate_requested),
            estimateDetails: i.estimate_request_details ?? "",
          })),
      };
    });
    setPickups(mapped);
  }, [supportsEstimateFields, toast]);

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
      const { data: selectedClient, error: clientError } = await supabaseExtended
        .from("clients")
        .select("id, route_day, address")
        .eq("id", clientId)
        .maybeSingle();

      if (clientError || !selectedClient?.id) {
        toast({ title: "No client found", description: clientError?.message ?? "Please try again later.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const derivedRouteDay = (selectedClient as ClientLookupRow).route_day || DEFAULT_ROUTE_DAY;
      const derivedRegion = (selectedClient as ClientLookupRow).address?.includes("Westchester") ? "Westchester" : DEFAULT_REGION;
      setRouteDay(derivedRouteDay);
      setRegion(derivedRegion);
      setRequestDate(getNextDateForRouteDay(derivedRouteDay));

      const { data: rugRows, error: rugError } = await supabaseExtended
        .from("rugs")
        .select("id, tag, description, services")
        .eq("client_id", selectedClient.id)
        .eq("status", "picked_up")
        .order("checked_in_at", { ascending: false })
        .limit(300);

      if (rugError) {
        toast({ title: "Failed to load rugs", description: rugError.message, variant: "destructive" });
        setLoading(false);
        return;
      }

      setReadyRugs(((rugRows ?? []) as ReadyRugRow[]).map((r) => ({
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

  const handleSchedulePickup = async () => {
    if (!clientId) return;
    if (nextPendingPickup) return;
    const scheduledDate = requestDate && /^\d{4}-\d{2}-\d{2}$/.test(requestDate) ? requestDate : getNextDateForRouteDay(routeDay);
    setRequesting(true);
    try {
      const insertPayload: ExtendedTableInsert<"pickup_requests"> = {
        client_id: clientId,
        route_day: routeDay,
        scheduled_date: scheduledDate,
        status: "pending",
        notes: "",
      };
      const { error } = await supabaseExtended.from("pickup_requests").insert(insertPayload);
      if (error) {
        toast({ title: "Request failed", description: error.message, variant: "destructive" });
        return;
      }
      await fetchPickups(clientId, region);
      toast({ title: "Pickup requested", description: `We’ll pick up on ${formatPickupDate(scheduledDate)}. Add which rugs below and save.` });
    } finally {
      setRequesting(false);
    }
  };

  const buildKnownRugEstimateRequests = useCallback(() => {
    const out: Record<string, { requested: boolean; details: string }> = {};
    readyRugNumbers.forEach((rn) => {
      out[rn] = draftEstimateByRug[rn] ?? { requested: false, details: "" };
    });
    return out;
  }, [draftEstimateByRug, readyRugNumbers]);

  const handleSave = async (id: string, updates: Partial<PortalPickup>, options?: { allowEmpty?: boolean }) => {
    if (!clientId) return;
    const allowEmpty = options?.allowEmpty ?? false;
    const pickup = pickups.find((entry) => entry.id === id);
    if (!pickup || !canPortalEditPickup(pickup.status)) {
      toast({ title: "Can’t edit", description: "Only your current pickup can be edited.", variant: "destructive" });
      return;
    }

    const nextReady = updates.rugNumbers ?? draftSelectedRugs;
    const nextNewRugsRaw = updates.newRugs ?? draftNewRugs;
    const hasBlankNewRug = nextNewRugsRaw.some((rug) => !rug.label?.trim());
    if (hasBlankNewRug) {
      toast({ title: "Add a name", description: "Every rug needs a name or number.", variant: "destructive" });
      return;
    }

    const nextNewRugs = nextNewRugsRaw.map((rug) => ({
      ...rug,
      label: rug.label.trim(),
      rugType: (rug.rugType ?? "").trim(),
      length: Number(rug.length ?? 0),
      width: Number(rug.width ?? 0),
      estimateRequested: supportsEstimateFields ? (rug.estimateRequested ?? false) : false,
      estimateDetails: supportsEstimateFields ? (rug.estimateDetails ?? "") : "",
    }));

    if (!allowEmpty && nextReady.length === 0 && nextNewRugs.length === 0) {
      toast({ title: "Add at least one rug", description: "Check the rugs we’ve cleaned before, or add a new one.", variant: "destructive" });
      return;
    }

    const { error: updateErr } = await supabaseExtended
      .from("pickup_requests")
      .update({ notes: updates.notes ?? draftNotes })
      .eq("id", id);
    if (updateErr) {
      toast({ title: "Save failed", description: updateErr.message, variant: "destructive" });
      return;
    }

    const { error: clearError } = await supabaseExtended
      .from("pickup_request_items")
      .delete()
      .eq("pickup_request_id", id);
    if (clearError) {
      toast({ title: "Save failed", description: clearError.message, variant: "destructive" });
      return;
    }

    const readyItems = nextReady.map((rugNumber) => {
      const est = draftEstimateByRug[rugNumber] ?? { requested: false, details: "" };
      return {
        pickup_request_id: id,
        rug_number: rugNumber,
        rug_type: "",
        is_new: false,
        ...(supportsEstimateFields ? { estimate_requested: est.requested, estimate_request_details: est.details.trim() || null } : {}),
      };
    });
    const newRugItems = nextNewRugs.map((rug) => ({
      pickup_request_id: id,
      rug_number: rug.label,
      rug_type: rug.rugType,
      length: rug.length > 0 ? rug.length : null,
      width: rug.width > 0 ? rug.width : null,
      is_new: true,
      ...(supportsEstimateFields ? { estimate_requested: rug.estimateRequested ?? false, estimate_request_details: (rug.estimateDetails ?? "").trim() || null } : {}),
    }));
    const insertItems = [...readyItems, ...newRugItems];
    if (insertItems.length > 0) {
      const { error: insertErr } = await supabaseExtended.from("pickup_request_items").insert(insertItems);
      if (insertErr) {
        toast({ title: "Save failed", description: insertErr.message, variant: "destructive" });
        return;
      }
    }
    await fetchPickups(clientId, region);
    toast({ title: "Saved", description: "Your pickup list is updated." });
  };

  const handleSaveScheduledPickup = async () => {
    if (!nextPendingPickup) {
      toast({ title: "Request a pickup first", description: "Use the button above to request a pickup, then add rugs.", variant: "destructive" });
      return;
    }
    await handleSave(
      nextPendingPickup.id,
      {
        rugNumbers: draftSelectedRugs,
        newRugs: draftNewRugs,
        notes: draftNotes,
        knownRugEstimateRequests: buildKnownRugEstimateRequests(),
      },
      { allowEmpty: true }
    );
  };

  const handleCancel = async (id: string) => {
    if (!clientId) return;
    const pickup = pickups.find((entry) => entry.id === id);
    if (!pickup || !canRoleTransitionPickupStatus("portal", pickup.status, "cancelled")) {
      toast({ title: "Can’t cancel", description: "Only your current pickup can be cancelled.", variant: "destructive" });
      return;
    }
    const { error: deleteItemsError } = await supabaseExtended.from("pickup_request_items").delete().eq("pickup_request_id", id);
    if (deleteItemsError) {
      toast({ title: "Cancellation failed", description: deleteItemsError.message, variant: "destructive" });
      return;
    }
    const { error: deleteRequestError } = await supabaseExtended.from("pickup_requests").delete().eq("id", id);
    if (deleteRequestError) {
      toast({ title: "Cancellation failed", description: deleteRequestError.message, variant: "destructive" });
      return;
    }
    await fetchPickups(clientId, region);
    toast({ title: "Pickup cancelled" });
  };

  if (portalClientLoading || loading) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Loading pickups…
      </div>
    );
  }

  if (!clientId) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {errorMessage ?? "This account isn’t linked to a client. Contact support."}
      </div>
    );
  }

  const scheduledDateStr = formatPickupDate(requestDate);
  const rugCount = draftSelectedRugs.length + draftNewRugs.filter((r) => r.label.trim()).length;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* One main card: request or edit current pickup */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="bg-muted/50 px-4 py-3 border-b">
          <p className="text-sm text-muted-foreground">
            We pick up in <strong className="text-foreground">{region}</strong> on <strong className="text-foreground">{routeDay}s</strong>.
          </p>
        </div>

        <div className="p-4 space-y-6">
          {!nextPendingPickup ? (
            <>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Request a pickup</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Your next pickup date is <strong className="text-foreground">{scheduledDateStr}</strong>. Click below to request it, then tell us which rugs to pick up.
                </p>
              </div>
              <Button size="lg" className="w-full sm:w-auto" onClick={handleSchedulePickup} disabled={requesting}>
                <Truck className="mr-2 h-4 w-4" />
                {requesting ? "Requesting…" : "Request pickup"}
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Your upcoming pickup</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    <strong className="text-foreground">{scheduledDateStr}</strong> · Add or change rugs below, then save.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={handleCancel.bind(null, nextPendingPickup.id)} className="shrink-0">
                  Cancel pickup
                </Button>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Which rugs are we picking up?</h3>
                {readyRugNumbers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rugs in our system yet. Add new rugs below.</p>
                ) : (
                  <div className="space-y-2">
                    {readyRugNumbers.map((rn) => {
                      const est = draftEstimateByRug[rn] ?? { requested: false, details: "" };
                      return (
                        <div key={rn} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                          <label className="flex items-center gap-2 cursor-pointer shrink-0">
                            <Checkbox checked={draftSelectedRugs.includes(rn)} onCheckedChange={() => toggleDraftRug(rn)} />
                            <span className="text-sm font-medium">{rn}</span>
                          </label>
                          {supportsEstimateFields && (
                            <>
                              <label className="flex items-center gap-1.5 cursor-pointer text-sm text-muted-foreground ml-2">
                                <Checkbox checked={est.requested} onCheckedChange={(c) => setDraftEstimateForKnownRug(rn, Boolean(c), est.details)} />
                                <span>Estimate requested</span>
                              </label>
                              {est.requested && (
                                <Input
                                  placeholder="Details (optional)"
                                  value={est.details}
                                  onChange={(e) => setDraftEstimateForKnownRug(rn, true, e.target.value)}
                                  className="h-8 flex-1 min-w-[140px] text-sm"
                                />
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="pt-2">
                  <p className="text-sm font-medium text-foreground mb-2">Rugs not in our system yet</p>
                  <div className="space-y-2">
                    {draftNewRugs.map((rug) => (
                      <div key={rug.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                        <Input
                          placeholder="Rug name or number"
                          value={rug.label}
                          onChange={(e) => updateDraftRug(rug.id, "label", e.target.value)}
                          className="h-9 flex-1 min-w-[120px]"
                        />
                        <Input
                          type="number"
                          min={1}
                          placeholder="Length (ft)"
                          value={rug.length > 0 ? rug.length : ""}
                          onChange={(e) => updateDraftRug(rug.id, "length", Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className="h-9 w-20"
                        />
                        <Input
                          type="number"
                          min={1}
                          placeholder="Width (ft)"
                          value={rug.width > 0 ? rug.width : ""}
                          onChange={(e) => updateDraftRug(rug.id, "width", Math.max(0, parseInt(e.target.value, 10) || 0))}
                          className="h-9 w-20"
                        />
                        {supportsEstimateFields && (
                          <>
                            <label className="flex items-center gap-1.5 cursor-pointer text-sm text-muted-foreground shrink-0">
                              <Checkbox
                                checked={rug.estimateRequested ?? false}
                                onCheckedChange={(c) => updateDraftRug(rug.id, "estimateRequested", Boolean(c))}
                              />
                              <span>Estimate requested</span>
                            </label>
                            {(rug.estimateRequested ?? false) && (
                              <Input
                                placeholder="Details (optional)"
                                value={rug.estimateDetails ?? ""}
                                onChange={(e) => updateDraftRug(rug.id, "estimateDetails", e.target.value)}
                                className="h-8 flex-1 min-w-[120px] text-sm"
                              />
                            )}
                          </>
                        )}
                        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removeDraftRug(rug.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={addDraftRug}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add a rug
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground block mb-1">Anything else we should know?</label>
                  <Input
                    placeholder="Optional notes…"
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    className="h-9"
                  />
                </div>

                <Button size="lg" className="w-full sm:w-auto" onClick={handleSaveScheduledPickup} disabled={requesting}>
                  {requesting ? "Saving…" : rugCount > 0 ? `Save list (${rugCount} rug${rugCount === 1 ? "" : "s"})` : "Save"}
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Past pickups: compact list */}
      {pickups.filter((p) => p.id !== nextPendingPickup?.id).length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Past pickups</h3>
          <div className="space-y-2">
            {pickups
              .filter((p) => p.id !== nextPendingPickup?.id)
              .map((pickup) => (
                <PickupHistoryRow key={pickup.id} pickup={pickup} onCancel={handleCancel} />
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PickupHistoryRow({ pickup, onCancel }: { pickup: PortalPickup; onCancel: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const locked = pickup.status === "confirmed";
  const d = new Date(`${pickup.date}T12:00:00`);
  const dateStr = Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const totalRugs = pickup.rugNumbers.length + pickup.newRugs.length;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="font-medium text-foreground">{dateStr}</span>
        <span className="text-sm text-muted-foreground">
          {totalRugs} rug{totalRugs !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1">
          {locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground capitalize">{pickup.status}</span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t space-y-2">
          <div className="text-sm text-muted-foreground pt-2">
            {pickup.rugNumbers.length > 0 && (
              <p><strong className="text-foreground">Rugs:</strong> {pickup.rugNumbers.join(", ")}</p>
            )}
            {pickup.newRugs.length > 0 && (
              <p><strong className="text-foreground">New:</strong> {pickup.newRugs.map((r) => r.label || "Unnamed").join(", ")}</p>
            )}
            {pickup.notes && <p><strong className="text-foreground">Notes:</strong> {pickup.notes}</p>}
          </div>
          {!locked && (
            <Button variant="outline" size="sm" onClick={() => onCancel(pickup.id)}>
              Cancel this pickup
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
