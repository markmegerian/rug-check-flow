import { useCallback, useEffect, useMemo, useState } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { type PortalPickup, type PickupRugEntry } from "@/types/portal";
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

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

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

/** Strip all non-numeric characters from a string. */
function numericOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

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

export default function PortalPickupsTab() {
  const { toast } = useToast();
  const { clientId, loading: portalClientLoading, errorMessage } = usePortalClient();

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

  const nextPendingPickup = useMemo(
    () => pickups.find((p) => p.status === "pending" || p.status === "confirmed") ?? null,
    [pickups],
  );
  const pastPickups = useMemo(() => pickups.filter((p) => p.id !== nextPendingPickup?.id), [pickups, nextPendingPickup]);
  const pastPickupsPagination = usePaginatedList(pastPickups);

  const isLocked = nextPendingPickup?.status === "confirmed";

  /* ---- Draft rug CRUD ---- */

  const addDraftRug = useCallback(() => {
    setDraftRugs((prev) => [
      ...prev,
      { id: `nr-${Date.now()}`, label: "", rugType: "", length: 0, width: 0, estimateRequested: false, estimateDetails: "" },
    ]);
  }, []);

  const updateDraftRug = useCallback((id: string, field: keyof PickupRugEntry, value: string | number | boolean) => {
    setDraftRugs((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const removeDraftRug = useCallback((id: string) => {
    setDraftRugs((prev) => prev.filter((r) => r.id !== id));
  }, []);

  /** Check for duplicate rug numbers among draft rugs (numeric comparison). */
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
    // All items are stored as newRugs now
    setDraftRugs(
      nextPendingPickup.newRugs.map((r) => ({
        ...r,
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
      const { error } = await supabaseExtended.from("pickup_requests").insert(insertPayload);
      if (error) {
        toast({ title: "Request failed", description: error.message, variant: "destructive" });
        return;
      }
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

    // Validate: every rug must have a non-empty numeric rug number
    const rugsWithErrors = draftRugs.filter((r) => !r.label.trim());
    if (rugsWithErrors.length > 0) {
      toast({ title: "Missing rug number", description: "Every rug must have a rug number.", variant: "destructive" });
      return;
    }

    // Validate: no duplicate rug numbers
    const allNumbers = draftRugs.map((r) => r.label.trim());
    const seen = new Set<string>();
    for (const num of allNumbers) {
      if (seen.has(num)) {
        toast({ title: "Duplicate rug number", description: `Rug number "${num}" appears more than once.`, variant: "destructive" });
        return;
      }
      seen.add(num);
    }

    // Warn if no rugs (but don't block)
    if (draftRugs.length === 0) {
      toast({ title: "No rugs added", description: "You haven't added any rugs yet. Your pickup has been saved without rugs." });
    }

    // Update notes on the request
    const { error: updateErr } = await supabaseExtended
      .from("pickup_requests")
      .update({ notes: draftNotes })
      .eq("id", nextPendingPickup.id);
    if (updateErr) {
      toast({ title: "Save failed", description: updateErr.message, variant: "destructive" });
      return;
    }

    // Clear existing items
    const { error: clearError } = await supabaseExtended
      .from("pickup_request_items")
      .delete()
      .eq("pickup_request_id", nextPendingPickup.id);
    if (clearError) {
      toast({ title: "Save failed", description: clearError.message, variant: "destructive" });
      return;
    }

    // Insert fresh items
    const insertItems = draftRugs.map((rug) => ({
      pickup_request_id: nextPendingPickup.id,
      rug_number: rug.label.trim(),
      rug_type: (rug.rugType ?? "").trim() || null,
      length: rug.length > 0 ? rug.length : null,
      width: rug.width > 0 ? rug.width : null,
      is_new: true,
      ...(supportsEstimateFields
        ? { estimate_requested: rug.estimateRequested ?? false, estimate_request_details: (rug.estimateDetails ?? "").trim() || null }
        : {}),
    }));

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

  /* ---- Cancel a pickup ---- */

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

  /* ---- Loading / error states ---- */

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

  /* ---- Render ---- */

  const scheduledDateStr = formatPickupDate(requestDate);
  const rugCount = draftRugs.filter((r) => r.label.trim()).length;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Main card */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="bg-muted/50 px-4 py-3 border-b">
          <p className="text-sm text-muted-foreground">
            We pick up in <strong className="text-foreground">{region}</strong> on <strong className="text-foreground">{routeDay}s</strong>.
          </p>
        </div>

        <div className="p-4 space-y-6">
          {!nextPendingPickup ? (
            /* ---------- No pending pickup: show Request button ---------- */
            <>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Request a pickup</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Your next pickup date is <strong className="text-foreground">{scheduledDateStr}</strong>.
                </p>
              </div>
              <Button size="lg" className="w-full sm:w-auto" onClick={handleSchedulePickup} disabled={requesting}>
                <Truck className="mr-2 h-4 w-4" />
                {requesting ? "Requesting…" : "Request pickup"}
              </Button>
            </>
          ) : isLocked ? (
            /* ---------- Locked (confirmed): read-only ---------- */
            <>
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Pickup confirmed</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    <strong className="text-foreground">{scheduledDateStr}</strong> — the truck is on its way. No further changes can be made.
                  </p>
                </div>
              </div>
              {draftRugs.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-foreground">Rugs on this pickup</h3>
                  <ul className="text-sm text-muted-foreground list-disc list-inside">
                    {draftRugs.map((rug) => (
                      <li key={rug.id}>
                        #{rug.label}
                        {rug.rugType ? ` — ${rug.rugType}` : ""}
                        {rug.length > 0 && rug.width > 0 ? ` (${rug.length}×${rug.width} ft)` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            /* ---------- Pending pickup: editable rug list ---------- */
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Your upcoming pickup</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    <strong className="text-foreground">{scheduledDateStr}</strong> — add your rugs below, then save.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleCancel(nextPendingPickup.id)} className="shrink-0">
                  Cancel pickup
                </Button>
              </div>

              {/* Rug entries */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-foreground">Rugs for pickup</h3>

                {draftRugs.length === 0 && (
                  <p className="text-sm text-muted-foreground">No rugs added yet. Click below to add one.</p>
                )}

                <div className="space-y-2">
                  {draftRugs.map((rug) => {
                    const duplicate = isDuplicateRugNumber(rug.id, rug.label);
                    const emptyNumber = rug.label.trim() === "";
                    return (
                      <div key={rug.id} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          {/* Rug number */}
                          <div className="flex flex-col gap-0.5 flex-1 min-w-[100px]">
                            <label className="text-xs text-muted-foreground">Rug number *</label>
                            <Input
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="e.g. 1234"
                              value={rug.label}
                              onChange={(e) => updateDraftRug(rug.id, "label", numericOnly(e.target.value))}
                              className={duplicate || emptyNumber ? "border-destructive" : ""}
                            />
                            {duplicate && <p className="text-xs text-destructive">Duplicate rug number.</p>}
                          </div>

                          {/* Client reference */}
                          <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
                            <label className="text-xs text-muted-foreground">Your reference (optional)</label>
                            <Input
                              placeholder="Your ref / ID"
                              value={rug.rugType}
                              onChange={(e) => updateDraftRug(rug.id, "rugType", e.target.value)}
                            />
                          </div>

                          {/* Remove button */}
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 mt-4" onClick={() => removeDraftRug(rug.id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex flex-wrap items-end gap-2">
                          {/* Length */}
                          <div className="flex flex-col gap-0.5">
                            <label className="text-xs text-muted-foreground">Length (ft)</label>
                            <Input
                              type="number"
                              min={1}
                              placeholder="—"
                              value={rug.length > 0 ? rug.length : ""}
                              onChange={(e) => updateDraftRug(rug.id, "length", Math.max(0, parseInt(e.target.value, 10) || 0))}
                              className="h-9 w-20"
                            />
                          </div>

                          {/* Width */}
                          <div className="flex flex-col gap-0.5">
                            <label className="text-xs text-muted-foreground">Width (ft)</label>
                            <Input
                              type="number"
                              min={1}
                              placeholder="—"
                              value={rug.width > 0 ? rug.width : ""}
                              onChange={(e) => updateDraftRug(rug.id, "width", Math.max(0, parseInt(e.target.value, 10) || 0))}
                              className="h-9 w-20"
                            />
                          </div>

                          {/* Estimate checkbox */}
                          {supportsEstimateFields && (
                            <label className="flex items-center gap-1.5 cursor-pointer text-sm text-muted-foreground pb-1">
                              <Checkbox
                                checked={rug.estimateRequested ?? false}
                                onCheckedChange={(c) => updateDraftRug(rug.id, "estimateRequested", Boolean(c))}
                              />
                              <span>Request estimate</span>
                            </label>
                          )}
                        </div>

                        {/* Estimate details (only when checked) */}
                        {supportsEstimateFields && (rug.estimateRequested ?? false) && (
                          <Input
                            placeholder="Estimate details (optional)"
                            value={rug.estimateDetails ?? ""}
                            onChange={(e) => updateDraftRug(rug.id, "estimateDetails", e.target.value)}
                            className="h-8 text-sm"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <Button type="button" variant="outline" size="sm" onClick={addDraftRug}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add a rug
                </Button>
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">Anything else we should know?</label>
                <Input
                  placeholder="Optional notes…"
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  className="h-9"
                />
              </div>

              {/* Save */}
              <Button size="lg" className="w-full sm:w-auto" onClick={handleSave} disabled={requesting}>
                {requesting ? "Saving…" : rugCount > 0 ? `Save (${rugCount} rug${rugCount === 1 ? "" : "s"})` : "Save"}
              </Button>
            </>
          )}
        </div>
      </section>

      {/* Past pickups */}
      {pastPickups.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Past pickups</h3>
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

/* ------------------------------------------------------------------ */
/*  PickupHistoryRow                                                   */
/* ------------------------------------------------------------------ */

function PickupHistoryRow({ pickup, onCancel }: { pickup: PortalPickup; onCancel: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const locked = pickup.status === "confirmed";
  const d = new Date(`${pickup.date}T12:00:00`);
  const dateStr = Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const totalRugs = pickup.newRugs.length;

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
            {pickup.newRugs.length > 0 && (
              <p>
                <strong className="text-foreground">Rugs:</strong>{" "}
                {pickup.newRugs.map((r) => `#${r.label || "—"}${r.rugType ? ` (${r.rugType})` : ""}`).join(", ")}
              </p>
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
