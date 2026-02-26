import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { type PortalPickup, type PickupRugEntry } from "@/data/mock-portal";
import { useToast } from "@/hooks/use-toast";
import { CalendarClock, Lock, Plus, Truck, X } from "lucide-react";
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

const getNextDateForRouteDay = (routeDay: string) => {
  const targetDay = DAY_INDEX[routeDay] ?? 4;
  const today = new Date();
  const diff = (targetDay - today.getDay() + 7) % 7 || 7;
  const nextDate = new Date(today);
  nextDate.setDate(today.getDate() + diff);
  return nextDate;
};

const toLocalIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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
  const [requestDate, setRequestDate] = useState(() => getNextDateForRouteDay(DEFAULT_ROUTE_DAY));
  const [draftSelectedRugs, setDraftSelectedRugs] = useState<string[]>([]);
  const [draftNewRugs, setDraftNewRugs] = useState<PickupRugEntry[]>([]);
  const [draftKnownEstimateRequests, setDraftKnownEstimateRequests] = useState<Record<string, { requested: boolean; details: string }>>({});
  const [draftNotes, setDraftNotes] = useState("");
  const [supportsEstimateFields, setSupportsEstimateFields] = useState(true);

  const readyRugNumbers = useMemo(() => readyRugs.map((r) => r.rugNumber), [readyRugs]);

  const toggleDraftRug = useCallback((rn: string) => {
    setDraftSelectedRugs((prev) => (prev.includes(rn) ? prev.filter((r) => r !== rn) : [...prev, rn]));
  }, []);

  const addDraftRug = useCallback(() => {
    setDraftNewRugs((prev) => [...prev, { id: `nr-${Date.now()}`, label: "", rugType: "", length: 0, width: 0 }]);
  }, []);

  const updateDraftRug = useCallback((id: string, field: keyof PickupRugEntry, value: string | number | boolean) => {
    setDraftNewRugs((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const updateDraftKnownEstimate = useCallback((rugNumber: string, updates: Partial<{ requested: boolean; details: string }>) => {
    setDraftKnownEstimateRequests((prev) => {
      const current = prev[rugNumber] ?? { requested: false, details: "" };
      return { ...prev, [rugNumber]: { ...current, ...updates } };
    });
  }, []);

  const removeDraftRug = useCallback((id: string) => {
    setDraftNewRugs((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const fetchPickups = useCallback(async (activeClientId: string, activeRegion: string) => {
    const { data: reqData, error: reqError } = await supabaseExtended
      .from("pickup_requests")
      .select("id, client_id, route_day, scheduled_date, status, notes")
      .eq("client_id", activeClientId)
      .order("scheduled_date", { ascending: true })
      .limit(150);

    if (reqError) {
      toast({ title: "Failed to load pickup requests", description: reqError.message, variant: "destructive" });
      return;
    }

    const requests = (reqData ?? []) as PickupRequestRow[];
    if (requests.length === 0) { setPickups([]); return; }

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
    if (portalClientLoading) { setLoading(true); return; }
    if (errorMessage) {
      toast({ title: "No portal access", description: errorMessage, variant: "destructive" });
      setLoading(false); setReadyRugs([]); setPickups([]); return;
    }
    if (!clientId) { setLoading(false); return; }

    const init = async () => {
      setLoading(true);
      const { data: selectedClient, error: clientError } = await supabaseExtended
        .from("clients")
        .select("id, route_day, address")
        .eq("id", clientId)
        .maybeSingle();

      if (clientError || !selectedClient?.id) {
        toast({ title: "No client found", description: clientError?.message ?? "Please create at least one client record first.", variant: "destructive" });
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
        // "picked_up" represents rugs delivered back to the client (on file) and can be re-serviced.
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

  const handleRequestPickup = async () => {
    if (!clientId) return;
    const cleanedNewRugs = draftNewRugs
      .map((rug) => ({
        label: rug.label.trim(),
        rugType: rug.rugType.trim(),
        length: Number(rug.length ?? 0),
        width: Number(rug.width ?? 0),
        estimateRequested: Boolean(rug.estimateRequested),
        estimateDetails: (rug.estimateDetails ?? "").trim(),
      }))
      .filter((rug) => rug.label.length > 0);

    if (draftSelectedRugs.length === 0 && cleanedNewRugs.length === 0) {
      toast({
        title: "Add at least one rug",
        description: "Select an existing rug or add an additional rug before requesting a pickup.",
        variant: "destructive",
      });
      return;
    }

    const scheduledDate = requestDate || getNextDateForRouteDay(routeDay);

    setRequesting(true);
    try {
      const { data: existingPending, error: pendingLookupError } = await supabaseExtended
        .from("pickup_requests")
        .select("id, notes")
        .eq("client_id", clientId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (pendingLookupError) {
        toast({ title: "Request failed", description: pendingLookupError.message, variant: "destructive" });
        return;
      }

      let targetRequestId: string;
      let wasMergedIntoPending = false;

      if (existingPending?.id) {
        wasMergedIntoPending = true;
        targetRequestId = existingPending.id;

        const mergedNotes = draftNotes.trim().length > 0 ? draftNotes : (existingPending.notes ?? "");
        const { error: mergeUpdateError } = await supabaseExtended
          .from("pickup_requests")
          .update({ notes: mergedNotes })
          .eq("id", targetRequestId)
          .eq("status", "pending");

        if (mergeUpdateError) {
          toast({ title: "Request failed", description: mergeUpdateError.message, variant: "destructive" });
          return;
        }

        const { error: clearItemsError } = await supabaseExtended
          .from("pickup_request_items")
          .delete()
          .eq("pickup_request_id", targetRequestId);

        if (clearItemsError) {
          toast({ title: "Request failed", description: clearItemsError.message, variant: "destructive" });
          return;
        }
      } else {
        const insertPayload: ExtendedTableInsert<"pickup_requests"> = {
          client_id: clientId,
          route_day: routeDay,
          scheduled_date: scheduledDate,
          status: "pending",
          notes: draftNotes,
        };

        const { data: inserted, error } = await supabaseExtended
          .from("pickup_requests")
          .insert(insertPayload)
          .select("id")
          .single();

        if (error || !inserted) {
          toast({ title: "Request failed", description: error?.message ?? "Unknown error", variant: "destructive" });
          return;
        }

        targetRequestId = inserted.id;
      }

      const selectedKnownItems = draftSelectedRugs.map((rugNumber) => ({
        pickup_request_id: targetRequestId,
        rug_number: rugNumber,
        rug_type: "",
        is_new: false,
        ...(supportsEstimateFields
          ? {
              estimate_requested: draftKnownEstimateRequests[rugNumber]?.requested ?? false,
              estimate_request_details: draftKnownEstimateRequests[rugNumber]?.requested
                ? (draftKnownEstimateRequests[rugNumber]?.details?.trim() || null)
                : null,
            }
          : {}),
      }));

      const newRugItems = cleanedNewRugs.map((rug) => ({
        pickup_request_id: targetRequestId,
        rug_number: rug.label,
        rug_type: rug.rugType,
        length: rug.length > 0 ? rug.length : null,
        width: rug.width > 0 ? rug.width : null,
        is_new: true,
        ...(supportsEstimateFields
          ? {
              estimate_requested: rug.estimateRequested,
              estimate_request_details: rug.estimateRequested ? (rug.estimateDetails || null) : null,
            }
          : {}),
      }));

      const items = [...selectedKnownItems, ...newRugItems];
      if (items.length > 0) {
        const { error: itemError } = await supabaseExtended.from("pickup_request_items").insert(items);
        if (itemError) {
          toast({ title: "Pickup requested with warnings", description: itemError.message, variant: "destructive" });
        }
      }

      await fetchPickups(clientId, region);
      setDraftSelectedRugs([]);
      setDraftNewRugs([]);
      setDraftKnownEstimateRequests({});
      setDraftNotes("");
      toast(
        wasMergedIntoPending
          ? {
              title: "Pending pickup updated",
              description: "Your existing pending pickup request was updated with the latest changes.",
            }
          : {
              title: "Pickup requested",
              description: `Scheduled for ${routeDay} (${new Date(`${scheduledDate}T00:00:00`).toLocaleDateString()}) based on your service route.`,
            }
      );
    } finally {
      setRequesting(false);
    }
  };

  const handleSave = async (id: string, updates: Partial<PortalPickup>) => {
    if (!clientId) return;
    const pickup = pickups.find((entry) => entry.id === id);
    if (!pickup || !canPortalEditPickup(pickup.status)) {
      toast({ title: "Pickup is locked", description: "Only pending pickups can be edited.", variant: "destructive" });
      return;
    }

    const nextReady = updates.rugNumbers ?? [];
    const nextNewRugsRaw = updates.newRugs ?? [];
    const hasBlankNewRug = nextNewRugsRaw.some((rug) => !rug.label?.trim());
    if (hasBlankNewRug) {
      toast({
        title: "Missing rug name",
        description: "Additional rugs must have a name before you can save this pickup request.",
        variant: "destructive",
      });
      return;
    }

    const nextNewRugs = nextNewRugsRaw.map((rug) => ({
      ...rug,
      label: rug.label.trim(),
      rugType: (rug.rugType ?? "").trim(),
      length: Number(rug.length ?? 0),
      width: Number(rug.width ?? 0),
    }));

    if (nextReady.length === 0 && nextNewRugs.length === 0) {
      toast({
        title: "Add at least one rug",
        description: "Select an existing rug or add an additional rug before saving.",
        variant: "destructive",
      });
      return;
    }

    const { error: updateErr } = await supabaseExtended
      .from("pickup_requests")
      .update({ notes: updates.notes ?? "" })
      .eq("id", id);
    if (updateErr) {
      toast({ title: "Save failed", description: updateErr.message, variant: "destructive" });
      return;
    }
    const { error: deleteErr } = await supabaseExtended.from("pickup_request_items").delete().eq("pickup_request_id", id);
    if (deleteErr) {
      toast({ title: "Save failed", description: deleteErr.message, variant: "destructive" });
      return;
    }
    const readyItems = nextReady.map((rugNumber) => ({
      pickup_request_id: id,
      rug_number: rugNumber,
      rug_type: "",
      is_new: false,
      ...(supportsEstimateFields
        ? {
            estimate_requested: updates.knownRugEstimateRequests?.[rugNumber]?.requested ?? false,
            estimate_request_details: updates.knownRugEstimateRequests?.[rugNumber]?.requested
              ? (updates.knownRugEstimateRequests?.[rugNumber]?.details?.trim() || null)
              : null,
          }
        : {}),
    }));
    const newRugItems = nextNewRugs.map((rug) => ({
      pickup_request_id: id,
      rug_number: rug.label,
      rug_type: rug.rugType,
      length: rug.length > 0 ? rug.length : null,
      width: rug.width > 0 ? rug.width : null,
      is_new: true,
      ...(supportsEstimateFields
        ? {
            estimate_requested: Boolean(rug.estimateRequested),
            estimate_request_details: rug.estimateRequested ? (rug.estimateDetails?.trim() || null) : null,
          }
        : {}),
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
    toast({ title: "Pickup saved" });
  };

  const handleCancel = async (id: string) => {
    if (!clientId) return;
    const pickup = pickups.find((entry) => entry.id === id);
    if (!pickup || !canRoleTransitionPickupStatus("portal", pickup.status, "cancelled")) {
      toast({ title: "Cancellation blocked", description: "Only pending pickups can be cancelled.", variant: "destructive" });
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
    return <div className="text-sm text-muted-foreground">Loading pickups…</div>;
  }

  if (!clientId) {
    return (
      <div className="text-sm text-muted-foreground">
        {errorMessage ?? "This login is not linked to an active wholesale portal account."}
      </div>
    );
  }

  const nextPendingPickup = pickups.find((pickup) => pickup.status === "pending");
  const selectedRugCount = draftSelectedRugs.length + draftNewRugs.filter((rug) => rug.label.trim().length > 0).length;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm flex items-center gap-2 text-muted-foreground">
        <CalendarClock className="h-4 w-4" />
        Service region: <span className="font-medium text-foreground">{region}</span> · Pickup route day: <span className="font-medium text-foreground">{routeDay}</span>
      </div>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Schedule a Pickup
        </h3>
        <div className="rounded-lg border bg-background p-4 space-y-4">
          {nextPendingPickup ? (
            <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
              Pickup scheduled for <strong>{new Date(`${nextPendingPickup.date}T00:00:00`).toLocaleDateString()}</strong> ({nextPendingPickup.routeDay}).
              Add or update rugs below to adjust this pending request.
            </div>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Next route pickup date will be <strong className="text-foreground">{new Date(`${requestDate}T00:00:00`).toLocaleDateString()}</strong> ({routeDay}).
            </div>
          )}

          <FieldRow label="Pickup date">
            <span className="text-sm font-medium">
              {new Date(`${requestDate}T00:00:00`).toLocaleDateString()} ({routeDay})
            </span>
          </FieldRow>

          <FieldRow label="Rugs on file">
            {readyRugNumbers.length === 0 ? (
              <span className="text-sm text-muted-foreground">
                No rugs on file yet. Add rugs below to request a pickup.
              </span>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {readyRugNumbers.map((rn) => (
                  <label key={rn} className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <Checkbox checked={draftSelectedRugs.includes(rn)} onCheckedChange={() => toggleDraftRug(rn)} />
                    {rn}
                  </label>
                ))}
              </div>
            )}
            {draftSelectedRugs.length > 0 ? (
              <div className="mt-2 space-y-2">
                {draftSelectedRugs.map((rugNumber) => {
                  const estimateRequest = draftKnownEstimateRequests[rugNumber] ?? { requested: false, details: "" };
                  return (
                    <div key={`${rugNumber}-estimate`} className="rounded-md border p-2">
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-xs font-medium shrink-0 whitespace-nowrap">
                          <Checkbox
                            checked={estimateRequest.requested}
                            onCheckedChange={(checked) => updateDraftKnownEstimate(rugNumber, { requested: Boolean(checked) })}
                          />
                          Request estimate for {rugNumber}
                        </label>
                        {estimateRequest.requested ? (
                          <Input
                            className="h-8 flex-1"
                            placeholder="Enter requested estimate details"
                            value={estimateRequest.details}
                            onChange={(e) => updateDraftKnownEstimate(rugNumber, { details: e.target.value })}
                          />
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </FieldRow>

          <FieldRow label="Additional rugs">
            <div className="space-y-2 w-full">
              {draftNewRugs.map((rug) => (
                <div key={rug.id} className="rounded-md border p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Rug Number"
                      value={rug.label}
                      onChange={(e) => updateDraftRug(rug.id, "label", e.target.value)}
                      className="h-8 w-28 min-w-0"
                    />
                    <Input
                      placeholder="Type"
                      value={rug.rugType}
                      onChange={(e) => updateDraftRug(rug.id, "rugType", e.target.value)}
                      className="h-8 flex-1 min-w-0"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number"
                        placeholder="L"
                        min={0}
                        value={rug.length || ""}
                        onChange={(e) => updateDraftRug(rug.id, "length", Number(e.target.value))}
                        className="h-8 w-14 text-center"
                      />
                      <span className="text-muted-foreground text-xs">×</span>
                      <Input
                        type="number"
                        placeholder="W"
                        min={0}
                        value={rug.width || ""}
                        onChange={(e) => updateDraftRug(rug.id, "width", Number(e.target.value))}
                        className="h-8 w-14 text-center"
                      />
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeDraftRug(rug.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs font-medium shrink-0 whitespace-nowrap">
                      <Checkbox
                        checked={Boolean(rug.estimateRequested)}
                        onCheckedChange={(checked) => updateDraftRug(rug.id, "estimateRequested", Boolean(checked))}
                      />
                      Request estimate
                    </label>
                    {rug.estimateRequested ? (
                      <Input
                        className="h-8 flex-1"
                        placeholder="Enter requested estimate details"
                        value={rug.estimateDetails ?? ""}
                        onChange={(e) => updateDraftRug(rug.id, "estimateDetails", e.target.value)}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
              <button
                onClick={addDraftRug}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3 w-3" /> Add rug
              </button>
            </div>
          </FieldRow>

          <FieldRow label="Notes">
            <Input
              placeholder="Optional notes…"
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              className="h-8"
            />
          </FieldRow>

          <div className="flex justify-end">
            <Button size="sm" onClick={handleRequestPickup} disabled={requesting}>
              <Truck className="mr-1.5 h-3.5 w-3.5" />
              {requesting ? "Scheduling…" : nextPendingPickup ? `Update Scheduled Pickup (${selectedRugCount})` : `Schedule Next Route Pickup (${selectedRugCount})`}
            </Button>
          </div>
        </div>
      </section>

      {pickups.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Requests</h3>
          <div className="space-y-3">
            {pickups.map((pickup) => (
              <PickupCard key={pickup.id} pickup={pickup} readyRugNumbers={readyRugNumbers} onSave={handleSave} onCancel={handleCancel} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function PickupCard({ pickup, readyRugNumbers, onSave, onCancel }: {
  pickup: PortalPickup; readyRugNumbers: string[];
  onSave: (id: string, updates: Partial<PortalPickup>) => void;
  onCancel: (id: string) => void;
}) {
  const locked = pickup.status === "confirmed";
  const [selectedRugs, setSelectedRugs] = useState<string[]>(pickup.rugNumbers);
  const [notes, setNotes] = useState(pickup.notes || "");
  const [newRugs, setNewRugs] = useState<PickupRugEntry[]>(pickup.newRugs);
  const [knownRugEstimateRequests, setKnownRugEstimateRequests] = useState<Record<string, { requested: boolean; details: string }>>(pickup.knownRugEstimateRequests ?? {});

  const fmtDate = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const toggleRug = (rn: string) =>
    setSelectedRugs((prev) => (prev.includes(rn) ? prev.filter((r) => r !== rn) : [...prev, rn]));
  const addNewRug = () =>
    setNewRugs((prev) => [...prev, { id: `nr-${Date.now()}`, label: "", rugType: "", length: 0, width: 0 }]);
  const updateNewRug = (id: string, field: keyof PickupRugEntry, value: string | number | boolean) =>
    setNewRugs((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const removeNewRug = (id: string) => setNewRugs((prev) => prev.filter((r) => r.id !== id));
  const updateKnownEstimate = (rugNumber: string, updates: Partial<{ requested: boolean; details: string }>) =>
    setKnownRugEstimateRequests((prev) => {
      const current = prev[rugNumber] ?? { requested: false, details: "" };
      return { ...prev, [rugNumber]: { ...current, ...updates } };
    });

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      {locked && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted text-xs text-muted-foreground border-b">
          <Lock className="h-3 w-3" /> Confirmed — no longer editable
        </div>
      )}
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">{fmtDate(pickup.date)}</span>
          <span className="text-muted-foreground">{pickup.routeDay} route · {pickup.region}</span>
        </div>

        {readyRugNumbers.length > 0 && (
          <FieldRow label="Rugs on file">
            {locked ? (
              <span className="text-sm">{pickup.rugNumbers.join(", ") || "—"}</span>
            ) : (
              <div className="space-y-2">
                {readyRugNumbers.map((rn) => (
                  <div key={rn} className="rounded-md border p-2">
                    <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                      <Checkbox checked={selectedRugs.includes(rn)} onCheckedChange={() => toggleRug(rn)} />
                      {rn}
                    </label>
                    {selectedRugs.includes(rn) ? (
                      <div className="mt-2 flex items-center gap-2">
                        <label className="flex items-center gap-2 text-xs font-medium shrink-0 whitespace-nowrap">
                          <Checkbox
                            checked={knownRugEstimateRequests[rn]?.requested ?? false}
                            onCheckedChange={(checked) => updateKnownEstimate(rn, { requested: Boolean(checked) })}
                          />
                          Request estimate for {rn}
                        </label>
                        {knownRugEstimateRequests[rn]?.requested ? (
                          <Input
                            className="h-8 flex-1"
                            placeholder="Enter requested estimate details"
                            value={knownRugEstimateRequests[rn]?.details ?? ""}
                            onChange={(e) => updateKnownEstimate(rn, { details: e.target.value })}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
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
                <div key={rug.id} className="rounded-md border p-2 space-y-2">
                  <div className="flex items-center gap-2">
                  <Input placeholder="Rug Number" value={rug.label} onChange={(e) => updateNewRug(rug.id, "label", e.target.value)} className="h-8 w-28 min-w-0" />
                  <Input placeholder="Type" value={rug.rugType} onChange={(e) => updateNewRug(rug.id, "rugType", e.target.value)} className="h-8 flex-1 min-w-0" />
                  <div className="flex items-center gap-1 shrink-0">
                    <Input type="number" placeholder="L" min={0} value={rug.length || ""} onChange={(e) => updateNewRug(rug.id, "length", Number(e.target.value))} className="h-8 w-14 text-center" />
                    <span className="text-muted-foreground text-xs">×</span>
                    <Input type="number" placeholder="W" min={0} value={rug.width || ""} onChange={(e) => updateNewRug(rug.id, "width", Number(e.target.value))} className="h-8 w-14 text-center" />
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeNewRug(rug.id)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs font-medium shrink-0 whitespace-nowrap">
                      <Checkbox
                        checked={Boolean(rug.estimateRequested)}
                        onCheckedChange={(checked) => updateNewRug(rug.id, "estimateRequested", Boolean(checked))}
                      />
                      Request estimate
                    </label>
                    {rug.estimateRequested ? (
                      <Input
                        className="h-8 flex-1"
                        placeholder="Enter requested estimate details"
                        value={rug.estimateDetails ?? ""}
                        onChange={(e) => updateNewRug(rug.id, "estimateDetails", e.target.value)}
                      />
                    ) : null}
                  </div>
                </div>
              ))}
              <button onClick={addNewRug} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                <Plus className="h-3 w-3" /> Add rug
              </button>
            </div>
          )}
        </FieldRow>

        <FieldRow label="Notes">
          {locked ? (
            <span className="text-sm">{pickup.notes || "—"}</span>
          ) : (
            <Input placeholder="Optional notes…" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-8" />
          )}
        </FieldRow>

        {!locked && (
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => onCancel(pickup.id)}>Cancel</Button>
            <Button size="sm" className="text-xs" onClick={() => onSave(pickup.id, { rugNumbers: selectedRugs, newRugs, notes, knownRugEstimateRequests })}>Save</Button>
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
