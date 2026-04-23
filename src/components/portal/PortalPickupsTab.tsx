import { useCallback, useEffect, useMemo, useState } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type PortalPickup, type PickupRugEntry } from "@/types/portal";
import { useToast } from "@/hooks/use-toast";
import type { PortalTabProps } from "./portal-tab-props";
import { Lock, Plus, Truck } from "lucide-react";
import { autoAssignPickupToDriver } from "@/lib/pickup-automation";
import {
  supabaseExtended,
  type ExtendedTableInsert,
  type ExtendedTableRow,
} from "@/integrations/supabase/extended";
import {
  canPortalEditPickup,
  canRoleTransitionPickupStatus,
  normalizePortalPickupStatus,
} from "@/lib/workflow-guards";
import type { Tables } from "@/integrations/supabase/types";
import { DEFAULT_ROUTE_DAY, DEFAULT_REGION } from "@/lib/constants";
import { getNextDateForRouteDay, formatPickupDate } from "@/lib/date-helpers";
import { findDuplicateRugNumber } from "@/lib/validation";
import { DraftRugCard } from "./DraftRugCard";
import { PickupHistoryRow } from "./PickupHistoryRow";

/* ------------------------------------------------------------------ */
/*  Row types                                                          */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function PortalPickupsTab({ clientId, loading: portalClientLoading, errorMessage }: PortalTabProps) {
  const { toast } = useToast();

  const [pickups, setPickups] = useState<PortalPickup[]>([]);
  const [loading, setLoading] = useState(true);
  const [routeDay, setRouteDay] = useState(DEFAULT_ROUTE_DAY);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [requesting, setRequesting] = useState(false);
  const [requestDate, setRequestDate] = useState<string>(() => getNextDateForRouteDay(DEFAULT_ROUTE_DAY));

  const [draftRugs, setDraftRugs] = useState<PickupRugEntry[]>([]);
  const [draftNotes, setDraftNotes] = useState("");
  const [supportsEstimateFields, setSupportsEstimateFields] = useState(true);
  const [draftHydratedPickupId, setDraftHydratedPickupId] = useState<string | null>(null);

  const nextPendingPickup = useMemo(() => pickups.find((p) => p.status === "pending") ?? null, [pickups]);
  const pastPickups = useMemo(() => pickups.filter((p) => p.id !== nextPendingPickup?.id), [pickups, nextPendingPickup]);
  const pastPickupsPagination = usePaginatedList(pastPickups);

  const isLocked = nextPendingPickup?.status === "confirmed";
  const [expandedRugId, setExpandedRugId] = useState<string | null>(null);

  /* ---- Draft rug CRUD ---- */

  const addDraftRug = useCallback(() => {
    const newId = `nr-${Date.now()}`;
    setDraftRugs((prev) => [
      ...prev,
      { id: newId, label: "", rugType: "", length: 0, width: 0, requestedServices: [], estimateRequested: false, estimateDetails: "" },
    ]);
    setExpandedRugId(newId);
  }, []);

  const updateDraftRug = useCallback((id: string, field: keyof PickupRugEntry, value: string | number | boolean) => {
    setDraftRugs((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const removeDraftRug = useCallback((id: string) => {
    setDraftRugs((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const toggleDraftRugService = useCallback((rugId: string, serviceName: string) => {
    setDraftRugs((prev) =>
      prev.map((r) => {
        if (r.id !== rugId) return r;
        const services = r.requestedServices ?? [];
        return {
          ...r,
          requestedServices: services.includes(serviceName)
            ? services.filter((s) => s !== serviceName)
            : [...services, serviceName],
        };
      }),
    );
  }, []);

  const isDuplicateRugNumber = useCallback(
    (rugId: string, label: string) => {
      const key = label.trim();
      if (!key) return false;
      return draftRugs.some((r) => r.id !== rugId && r.label.trim() === key);
    },
    [draftRugs],
  );

  /* ---- Hydrate draft state when pending pickup loads ---- */

  useEffect(() => {
    if (!nextPendingPickup) {
      setDraftHydratedPickupId(null);
      return;
    }
    if (draftHydratedPickupId === nextPendingPickup.id) return;
    setDraftRugs(
      nextPendingPickup.newRugs.map((r) => ({
        ...r,
        requestedServices: r.requestedServices ?? [],
        estimateRequested: r.estimateRequested ?? false,
        estimateDetails: r.estimateDetails ?? "",
      })),
    );
    setDraftNotes(nextPendingPickup.notes ?? "");
    setRequestDate(nextPendingPickup.date);
    setDraftHydratedPickupId(nextPendingPickup.id);
  }, [draftHydratedPickupId, nextPendingPickup]);

  /* ---- Fetch pickups ---- */

  const fetchPickups = useCallback(
    async (activeClientId: string, activeRegion: string) => {
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
          rugNumbers: [],
          newRugs: reqItems.map((i) => ({
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
    },
    [supportsEstimateFields, toast],
  );

  /* ---- Init: resolve client, route day, then fetch ---- */

  useEffect(() => {
    if (portalClientLoading) {
      setLoading(true);
      return;
    }
    if (errorMessage) {
      toast({ title: "No portal access", description: errorMessage, variant: "destructive" });
      setLoading(false);
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

      await fetchPickups(selectedClient.id, derivedRegion);
      setLoading(false);
    };

    init();
  }, [clientId, errorMessage, fetchPickups, portalClientLoading, toast]);

  /* ---- Schedule a new pickup ---- */

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
      const { data: insertedPickup, error } = await supabaseExtended.from("pickup_requests").insert(insertPayload).select("id").single();
      if (error || !insertedPickup) {
        toast({ title: "Request failed", description: error?.message ?? "Unknown error", variant: "destructive" });
        return;
      }
      await autoAssignPickupToDriver(insertedPickup.id);
      await fetchPickups(clientId, region);
      toast({ title: "Pickup requested", description: `We'll pick up on ${formatPickupDate(scheduledDate)}. Add your rugs below and save.` });
    } finally {
      setRequesting(false);
    }
  };

  /* ---- Save rug list (delete-and-replace pattern) ---- */

  const handleSave = async () => {
    if (!clientId || !nextPendingPickup) return;

    if (!canPortalEditPickup(nextPendingPickup.status)) {
      toast({ title: "Can't edit", description: "This pickup can no longer be edited.", variant: "destructive" });
      return;
    }

    const rugsWithErrors = draftRugs.filter((r) => !r.label.trim());
    if (rugsWithErrors.length > 0) {
      toast({ title: "Missing rug number", description: "Every rug must have a rug number.", variant: "destructive" });
      return;
    }

    const duplicate = findDuplicateRugNumber(draftRugs.map((r) => r.label));
    if (duplicate) {
      toast({ title: "Duplicate rug number", description: `Rug number "${duplicate}" appears more than once.`, variant: "destructive" });
      return;
    }

    if (draftRugs.length === 0) {
      toast({ title: "No rugs added", description: "You haven't added any rugs yet. Your pickup has been saved without rugs." });
    }

    const { error: updateErr } = await supabaseExtended
      .from("pickup_requests")
      .update({ notes: draftNotes })
      .eq("id", nextPendingPickup.id);
    if (updateErr) {
      toast({ title: "Save failed", description: updateErr.message, variant: "destructive" });
      return;
    }

    const { error: clearError } = await supabaseExtended
      .from("pickup_request_items")
      .delete()
      .eq("pickup_request_id", nextPendingPickup.id);
    if (clearError) {
      toast({ title: "Save failed", description: clearError.message, variant: "destructive" });
      return;
    }

    const insertItems = draftRugs.map((rug) => {
      const parts: string[] = [];
      const services = rug.requestedServices ?? [];
      if (services.length > 0) parts.push(`Services: ${services.join(", ")}`);
      const details = (rug.estimateDetails ?? "").trim();
      if (details) parts.push(details);
      const combinedDetails = parts.join(" | ") || null;

      return {
        pickup_request_id: nextPendingPickup.id,
        rug_number: rug.label.trim(),
        rug_type: (rug.rugType ?? "").trim() || "",
        length: rug.length > 0 ? rug.length : null,
        width: rug.width > 0 ? rug.width : null,
        is_new: true,
        ...(supportsEstimateFields
          ? { estimate_requested: (rug.estimateRequested ?? false) || services.length > 0, estimate_request_details: combinedDetails }
          : {}),
      };
    });

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

  const handleCancel = async (id: string) => {
    if (!clientId) return;
    const pickup = pickups.find((entry) => entry.id === id);
    if (!pickup || !canRoleTransitionPickupStatus("portal", pickup.status, "cancelled")) {
      toast({ title: "Can't cancel", description: "Only your current pickup can be cancelled.", variant: "destructive" });
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
        {errorMessage ?? "This account isn't linked to a client. Contact support."}
      </div>
    );
  }

  const scheduledDateStr = formatPickupDate(requestDate);
  const rugCount = draftRugs.filter((r) => r.label.trim()).length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card/90 shadow-sm overflow-hidden">
        <div className="p-4 space-y-5">
          {!nextPendingPickup ? (
            <>
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground">Request pickup</h2>
                <p className="text-sm text-muted-foreground">
                  Next pickup: <strong className="text-foreground">{scheduledDateStr}</strong>
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
                  <h2 className="text-base font-semibold text-foreground">
                    Upcoming pickup
                    {isLocked && <Lock className="inline-block ml-2 h-4 w-4 text-muted-foreground" />}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    <strong className="text-foreground">{scheduledDateStr}</strong> · {isLocked ? "Confirmed" : "Update your rug list below and save."}
                  </p>
                </div>
                {!isLocked && (
                  <Button variant="outline" size="sm" onClick={handleCancel.bind(null, nextPendingPickup.id)} className="shrink-0">
                    Cancel pickup
                  </Button>
                )}
              </div>

              {!isLocked && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-foreground">Rugs for pickup</h3>

                  <div className="space-y-2">
                    {draftRugs.map((rug) => (
                      <DraftRugCard
                        key={rug.id}
                        rug={rug}
                        isExpanded={expandedRugId === rug.id}
                        isDuplicate={isDuplicateRugNumber(rug.id, rug.label)}
                        onToggleExpand={() => setExpandedRugId(expandedRugId === rug.id ? null : rug.id)}
                        onUpdate={(field, value) => updateDraftRug(rug.id, field, value)}
                        onRemove={() => removeDraftRug(rug.id)}
                        onToggleService={(name) => toggleDraftRugService(rug.id, name)}
                      />
                    ))}

                    <Button type="button" variant="outline" size="sm" onClick={addDraftRug} className="w-full sm:w-auto">
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add a rug
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground block">Notes</label>
                    <Input
                      placeholder="Add notes if needed"
                      value={draftNotes}
                      onChange={(e) => setDraftNotes(e.target.value)}
                      className="h-11 rounded-2xl"
                    />
                  </div>

                  <Button size="lg" className="w-full sm:w-auto" onClick={handleSave} disabled={requesting}>
                    {requesting ? "Saving…" : rugCount > 0 ? `Save list (${rugCount} rug${rugCount === 1 ? "" : "s"})` : "Save"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {pastPickups.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">History</h3>
          <div className="space-y-2">
            {pastPickupsPagination.items.map((pickup) => (
              <PickupHistoryRow key={pickup.id} pickup={pickup} onCancel={handleCancel} />
            ))}
          </div>
          <PaginationControls
            page={pastPickupsPagination.page}
            totalPages={pastPickupsPagination.totalPages}
            total={pastPickupsPagination.total}
            hasPrev={pastPickupsPagination.hasPrev}
            hasNext={pastPickupsPagination.hasNext}
            onPrev={pastPickupsPagination.prevPage}
            onNext={pastPickupsPagination.nextPage}
            label="pickups"
          />
        </section>
      )}
    </div>
  );
}
