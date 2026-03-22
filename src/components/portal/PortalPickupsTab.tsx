import { useCallback, useEffect, useMemo, useState } from "react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type PortalPickup, type PickupRugEntry } from "@/types/portal";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Lock, Plus, Truck, X } from "lucide-react";
import { RUG_TYPES, SERVICES, SERVICE_CATEGORIES } from "@/data/services";
import { autoAssignPickupToDriver } from "@/lib/pickup-automation";
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
      // Auto-assign to the single driver account
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
    const insertItems = draftRugs.map((rug) => {
      // Build details string: combine requested services and free-text details
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
    <div className="space-y-8">
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
                  <h2 className="text-lg font-semibold text-foreground">
                    Your upcoming pickup
                    {isLocked && <Lock className="inline-block ml-2 h-4 w-4 text-muted-foreground" />}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    <strong className="text-foreground">{scheduledDateStr}</strong> · {isLocked ? "This pickup has been confirmed." : "Add or change rugs below, then save."}
                  </p>
                </div>
                {!isLocked && (
                  <Button variant="outline" size="sm" onClick={handleCancel.bind(null, nextPendingPickup.id)} className="shrink-0">
                    Cancel pickup
                  </Button>
                )}
              </div>

              {!isLocked && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-foreground">Which rugs are we picking up?</h3>

                  <div className="space-y-2">
                    {draftRugs.map((rug) => {
                      const isExpanded = expandedRugId === rug.id;
                      const summaryParts: string[] = [];
                      if (rug.rugType) summaryParts.push(rug.rugType);
                      if (rug.length > 0 || rug.width > 0) summaryParts.push(`${rug.length || 0}' × ${rug.width || 0}'`);
                      const serviceCount = (rug.requestedServices ?? []).length;

                      return (
                        <div key={rug.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                          {/* Collapsed / header row — always visible */}
                          <div
                            className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => setExpandedRugId(isExpanded ? null : rug.id)}
                          >
                            <span className="text-muted-foreground shrink-0">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </span>
                            <span className="text-sm font-semibold font-mono shrink-0">
                              {rug.label ? `#${rug.label}` : "New rug"}
                            </span>
                            {!isExpanded && summaryParts.length > 0 && (
                              <span className="text-xs text-muted-foreground truncate">
                                {summaryParts.join(" · ")}
                              </span>
                            )}
                            {!isExpanded && serviceCount > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                                {serviceCount} service{serviceCount !== 1 ? "s" : ""}
                              </span>
                            )}
                            <div className="flex-1" />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={(e) => { e.stopPropagation(); removeDraftRug(rug.id); }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Expanded body */}
                          {isExpanded && (
                            <div className="border-t p-4 space-y-4">
                              {/* Row 1: Rug number + type + dimensions */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div>
                                  <label className="text-xs text-muted-foreground block mb-1">Rug #</label>
                                  <Input
                                    placeholder="e.g. 1234"
                                    value={rug.label}
                                    onChange={(e) => updateDraftRug(rug.id, "label", numericOnly(e.target.value))}
                                    className={`h-9 font-mono ${isDuplicateRugNumber(rug.id, rug.label) ? "border-destructive" : ""}`}
                                  />
                                  {isDuplicateRugNumber(rug.id, rug.label) && (
                                    <p className="text-xs text-destructive mt-0.5">Duplicate</p>
                                  )}
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground block mb-1">Rug type</label>
                                  <Select
                                    value={rug.rugType || undefined}
                                    onValueChange={(v) => updateDraftRug(rug.id, "rugType", v)}
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue placeholder="Select type…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {RUG_TYPES.map((t) => (
                                        <SelectItem key={t} value={t}>{t}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground block mb-1">Length (ft)</label>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    placeholder="e.g. 9.10"
                                    value={rug.length > 0 ? rug.length : ""}
                                    onChange={(e) => updateDraftRug(rug.id, "length", Math.max(0, parseFloat(e.target.value) || 0))}
                                    className="h-9"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-muted-foreground block mb-1">Width (ft)</label>
                                  <Input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    placeholder="e.g. 2.09"
                                    value={rug.width > 0 ? rug.width : ""}
                                    onChange={(e) => updateDraftRug(rug.id, "width", Math.max(0, parseFloat(e.target.value) || 0))}
                                    className="h-9"
                                  />
                                </div>
                              </div>

                              {/* Row 2: Requested services */}
                              <div>
                                <label className="text-xs text-muted-foreground block mb-1.5">Requested services</label>
                                {SERVICE_CATEGORIES.map((cat) => {
                                  const catServices = SERVICES.filter((s) => s.category === cat);
                                  if (catServices.length === 0) return null;
                                  return (
                                    <div key={cat} className="mb-2">
                                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{cat}</span>
                                      <div className="flex flex-wrap gap-1.5 mt-1">
                                        {catServices.map((svc) => {
                                          const selected = (rug.requestedServices ?? []).includes(svc.name);
                                          return (
                                            <button
                                              key={svc.id}
                                              type="button"
                                              onClick={() => toggleDraftRugService(rug.id, svc.name)}
                                              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                                                selected
                                                  ? "bg-primary text-primary-foreground"
                                                  : "bg-muted text-muted-foreground hover:bg-muted/80"
                                              }`}
                                            >
                                              {svc.name}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Row 3: Additional notes */}
                              <div>
                                <label className="text-xs text-muted-foreground block mb-1">Additional notes</label>
                                <Input
                                  placeholder="Anything else we should know about this rug…"
                                  value={rug.estimateDetails ?? ""}
                                  onChange={(e) => updateDraftRug(rug.id, "estimateDetails", e.target.value)}
                                  className="h-9 text-sm"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <Button type="button" variant="outline" size="sm" onClick={addDraftRug} className="w-full sm:w-auto">
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add a rug
                    </Button>
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

                  <Button size="lg" className="w-full sm:w-auto" onClick={handleSave} disabled={requesting}>
                    {requesting ? "Saving…" : rugCount > 0 ? `Save list (${rugCount} rug${rugCount === 1 ? "" : "s"})` : "Save"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Past pickups: compact list */}
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
              <p><strong className="text-foreground">Rugs:</strong> {pickup.newRugs.map((r) => r.label || "Unnamed").join(", ")}</p>
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
