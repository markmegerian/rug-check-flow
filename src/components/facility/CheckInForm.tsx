import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/hooks/use-toast";
import { RUG_TYPES } from "@/data/services";
import { type PendingRug } from "@/types/pending-rug";
import { type CheckInEntry } from "@/data/check-in-log";
import { supabase } from "@/integrations/supabase/client";
import { calcSelectedLinearFt, type RugEdge } from "@/lib/rug-edges";
import { applyCleaningServiceMinimum, isCleaningCategory } from "@/lib/service-pricing";

import { CheckInPhotoSection, type PhotoItem } from "./CheckInPhotoSection";
import { CheckInServiceSelector, type DbService } from "./CheckInServiceSelector";

type PricingTier = "standard" | "preferred" | "vip";
type CheckInStep = "details" | "photos" | "decision" | "services";
type WashDecision = "standard" | "custom";

type ClientLookupCache = Record<string, { id: string | null; tier: PricingTier }>;
type WindowWithIdleCallback = Window & typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const STANDARD_WASH_SERVICE_NAME = "Standard Wash";
const CLIENT_LOOKUP_CACHE_KEY = "checkin-client-lookup-v1";

const checkInSchema = z.object({
  rugNumber: z.string().min(1, "Rug number is required"),
  clientName: z.string().min(1, "Client name is required"),
  rugType: z.string().min(1, "Rug type is required"),
  length: z.coerce.number().positive("Length must be greater than 0"),
  width: z.coerce.number().positive("Width must be greater than 0"),
  conditionNotes: z.string().optional(),
  selectedServices: z.array(z.string()),
});

type CheckInValues = z.infer<typeof checkInSchema>;

const EMPTY_CHECKIN_VALUES: CheckInValues = {
  rugNumber: "",
  clientName: "",
  rugType: "",
  length: 0,
  width: 0,
  conditionNotes: "",
  selectedServices: [],
};

interface CheckInFormProps {
  selectedRug?: PendingRug | null;
  editingEntry?: CheckInEntry | null;
  onCheckInComplete?: (data: {
    rugId?: string;
    clientId?: string | null;
    rugNumber: string;
    clientName: string;
    rugType: string;
    length: number;
    width: number;
    selectedServices: string[];
    serviceSnapshots: { service_id: string; service_name: string; unit_price: number; line_total: number; edges: string[] }[];
    totalPrice: number;
    conditionNotes: string;
    photos: File[];
  }) => Promise<{ status: "success" | "warning" | "error"; title: string; description: string; resetForm?: boolean }>;
}

const MemoizedCheckInPhotoSection = memo(CheckInPhotoSection);
const MemoizedCheckInServiceSelector = memo(CheckInServiceSelector);

function StepShell({
  title,
  description,
  eyebrow,
  children,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5 rounded-[1.5rem] border border-border/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,245,239,0.9))] p-5 shadow-[0_24px_60px_-40px_rgba(28,39,56,0.24)] md:min-h-[20rem] md:p-6">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
        ) : null}
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-foreground">{title}</h3>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function CheckInForm({ selectedRug, editingEntry, onCheckInComplete }: CheckInFormProps) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [clientTier, setClientTier] = useState<PricingTier>("standard");
  const [knownClientId, setKnownClientId] = useState<string | null>(null);
  const clientLookupCacheRef = useRef<ClientLookupCache>({});
  const [flatPrices, setFlatPrices] = useState<Record<string, string>>({});
  const [edgeSelections, setEdgeSelections] = useState<Record<string, RugEdge[]>>({});
  const [step, setStep] = useState<CheckInStep>("details");
  const [washDecision, setWashDecision] = useState<WashDecision>("standard");
  const [shouldLoadServices, setShouldLoadServices] = useState(false);

  const form = useForm<CheckInValues>({
    resolver: zodResolver(checkInSchema),
    defaultValues: EMPTY_CHECKIN_VALUES,
  });

  const isEditing = Boolean(editingEntry);
  const isReadOnlyIdentity = Boolean(selectedRug && selectedRug.source === "pickup");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLIENT_LOOKUP_CACHE_KEY);
      clientLookupCacheRef.current = raw ? JSON.parse(raw) as ClientLookupCache : {};
    } catch {
      clientLookupCacheRef.current = {};
    }
  }, []);

  const resolveClientLookup = useCallback(async (clientName: string, preferredClientId?: string | null) => {
    const normalizedClient = clientName.trim().toLowerCase();
    if (!normalizedClient) {
      setClientTier("standard");
      setKnownClientId(null);
      return;
    }

    const cachedClient = clientLookupCacheRef.current[normalizedClient];
    if (cachedClient) {
      setClientTier(cachedClient.tier);
      setKnownClientId(preferredClientId ?? cachedClient.id ?? null);
      return;
    }

    if (normalizedClient.length < 3) {
      setClientTier("standard");
      setKnownClientId(preferredClientId ?? null);
      return;
    }

    const { data } = await supabase
      .from("clients")
      .select("id, pricing_tier")
      .ilike("name", clientName.trim())
      .limit(1);

    const resolvedClient = data?.[0] ?? null;
    const resolvedTier = (resolvedClient?.pricing_tier as PricingTier | undefined) ?? "standard";
    const resolvedId = preferredClientId ?? resolvedClient?.id ?? null;
    setClientTier(resolvedTier);
    setKnownClientId(resolvedId);
    clientLookupCacheRef.current = {
      ...clientLookupCacheRef.current,
      [normalizedClient]: { id: resolvedId, tier: resolvedTier },
    };
    localStorage.setItem(CLIENT_LOOKUP_CACHE_KEY, JSON.stringify(clientLookupCacheRef.current));
  }, []);

  useEffect(() => {
    if (selectedRug) {
      form.reset({
        rugNumber: selectedRug.rugNumber,
        clientName: selectedRug.clientName,
        rugType: selectedRug.rugType ?? "",
        length: selectedRug.length ?? 0,
        width: selectedRug.width ?? 0,
        conditionNotes: "",
        selectedServices: [],
      });
      setPhotos([]);
      setFlatPrices({});
      setEdgeSelections({});
      setKnownClientId(selectedRug.clientId ?? null);
      setWashDecision("standard");
      setStep("details");
      setShouldLoadServices(false);
      void resolveClientLookup(selectedRug.clientName, selectedRug.clientId ?? null);
    }
  }, [selectedRug, form, resolveClientLookup]);

  useEffect(() => {
    if (editingEntry) {
      form.reset({
        rugNumber: editingEntry.rugNumber,
        clientName: editingEntry.clientName,
        rugType: editingEntry.rugType,
        length: editingEntry.length,
        width: editingEntry.width,
        conditionNotes: "",
        selectedServices: editingEntry.services.map((s) => s.id),
      });
      setPhotos([]);
      setFlatPrices({});
      setEdgeSelections({});
      setKnownClientId(null);
      const editingIsCustom = editingEntry.services.some((s) => s.name !== STANDARD_WASH_SERVICE_NAME);
      setWashDecision(editingIsCustom ? "custom" : "standard");
      setStep(editingIsCustom ? "services" : "details");
      setShouldLoadServices(editingIsCustom);
      void resolveClientLookup(editingEntry.clientName);
    }
  }, [editingEntry, form, resolveClientLookup]);

  useEffect(() => {
    if (step !== "services") return;
    setShouldLoadServices(true);
  }, [step]);

  const { data: dbServices = [] } = useQuery({
    queryKey: ["services", "active", "checkin", step === "services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, unit, base_price, preferred_price, vip_price, category")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as DbService[];
    },
    staleTime: 5 * 60_000,
    enabled: shouldLoadServices,
  });

  const values = form.watch();
  const length = Number(values.length) || 0;
  const width = Number(values.width) || 0;
  const sqft = length * width;

  const linearFt = useMemo(() => {
    if (length <= 0 || width <= 0) return 0;
    return 2 * (length + width);
  }, [length, width]);

  const getUnitPrice = useCallback(
    (svc: DbService): number => {
      switch (clientTier) {
        case "vip": return Number(svc.vip_price);
        case "preferred": return Number(svc.preferred_price);
        default: return Number(svc.base_price);
      }
    },
    [clientTier],
  );

  const serviceById = useMemo(() => {
    const map = new Map<string, DbService>();
    for (const svc of dbServices) map.set(svc.id, svc);
    return map;
  }, [dbServices]);

  const standardWashService = useMemo(
    () => dbServices.find((svc) => svc.name.toLowerCase() === STANDARD_WASH_SERVICE_NAME.toLowerCase()) ?? null,
    [dbServices],
  );

  const servicePricing = useMemo(() => {
    if (!shouldLoadServices) return new Map<string, { unitPrice: number; rawTotal: number; adjustedTotal: number }>();

    const pricing = new Map<string, { unitPrice: number; rawTotal: number; adjustedTotal: number }>();
    for (const svc of dbServices) {
      const unitPrice = getUnitPrice(svc);
      let rawTotal = unitPrice;

      if (svc.unit === "per sqft") {
        rawTotal = unitPrice * sqft;
      } else if (svc.unit === "per linear ft") {
        const edges = edgeSelections[svc.id] ?? [];
        rawTotal = unitPrice * calcSelectedLinearFt(edges, length, width);
      } else if (svc.unit === "flat") {
        const manual = parseFloat(flatPrices[svc.id] ?? "");
        rawTotal = Number.isNaN(manual) ? 0 : manual;
      }

      pricing.set(svc.id, {
        unitPrice,
        rawTotal,
        adjustedTotal: applyCleaningServiceMinimum(rawTotal, svc.category),
      });
    }
    return pricing;
  }, [dbServices, edgeSelections, flatPrices, getUnitPrice, length, shouldLoadServices, sqft, width]);

  const getLineTotal = useCallback(
    (serviceId: string) => servicePricing.get(serviceId)?.adjustedTotal ?? 0,
    [servicePricing],
  );

  const buildServiceSnapshots = useCallback((selectedServiceIds: string[]) => {
    return selectedServiceIds
      .map((id) => {
        const svc = serviceById.get(id);
        if (!svc) return null;
        const pricing = servicePricing.get(id);
        const lt = pricing?.adjustedTotal ?? 0;
        const rawUnitPrice = svc.unit === "flat" ? lt : (pricing?.unitPrice ?? getUnitPrice(svc));
        const up = isCleaningCategory(svc.category) ? lt : rawUnitPrice;
        const edges = svc.unit === "per linear ft" ? (edgeSelections[id] ?? []) : [];
        return { service_id: id, service_name: svc.name, unit_price: up, line_total: lt, edges };
      })
      .filter(Boolean) as { service_id: string; service_name: string; unit_price: number; line_total: number; edges: string[] }[];
  }, [edgeSelections, getUnitPrice, serviceById, servicePricing]);

  const selectedServices = values.selectedServices ?? [];
  const hasSelectedServices = selectedServices.length > 0;
  const tierLabel = clientTier !== "standard" ? clientTier.toUpperCase() : null;

  const toggleService = useCallback((serviceId: string) => {
    const current = form.getValues("selectedServices");
    const next = current.includes(serviceId)
      ? current.filter((id) => id !== serviceId)
      : [...current, serviceId];
    form.setValue("selectedServices", next, { shouldValidate: true });
  }, [form]);

  const submitCheckIn = useCallback(async (selectedServiceIds: string[]) => {
    const data = form.getValues();

    const parsed = checkInSchema.safeParse(data);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0] as keyof CheckInValues | undefined;
        if (field) form.setError(field, { message: issue.message });
      });
      toast({ title: "Missing information", description: "Please complete the required rug details.", variant: "destructive" });
      setStep("details");
      return;
    }

    if (photos.length < 1) {
      toast({ title: "Photos required", description: "Upload at least 1 photo.", variant: "destructive" });
      setStep("photos");
      return;
    }

    const serviceSnapshots = buildServiceSnapshots(selectedServiceIds);
    if (serviceSnapshots.length === 0) {
      toast({ title: "Select a service", description: "Choose Standard Wash or add custom services.", variant: "destructive" });
      if (washDecision === "custom") setStep("services");
      return;
    }

    const result = onCheckInComplete
      ? await onCheckInComplete({
          rugId: selectedRug?.id,
          clientId: knownClientId ?? selectedRug?.clientId ?? null,
          rugNumber: parsed.data.rugNumber,
          clientName: parsed.data.clientName,
          rugType: parsed.data.rugType,
          length: parsed.data.length,
          width: parsed.data.width,
          selectedServices: selectedServiceIds,
          serviceSnapshots,
          totalPrice: serviceSnapshots.reduce((sum, service) => sum + service.line_total, 0),
          conditionNotes: parsed.data.conditionNotes?.trim() ?? "",
          photos: photos.map((photo) => photo.file),
        })
      : { status: "success" as const, title: isEditing ? "Entry updated" : "Check-in complete", description: `Rug ${parsed.data.rugNumber} ${isEditing ? "updated" : "checked in"}.`, resetForm: true };

    if (result.status === "success" || result.status === "warning") {
      form.reset(EMPTY_CHECKIN_VALUES);
      setPhotos([]);
      setFlatPrices({});
      setEdgeSelections({});
      setClientTier("standard");
      setKnownClientId(null);
      setWashDecision("standard");
      setStep("details");
      setShouldLoadServices(false);
    }

    toast({
      title: result.title,
      description: result.description,
      variant: result.status === "error" ? "destructive" : "default",
    });
  }, [buildServiceSnapshots, form, isEditing, knownClientId, onCheckInComplete, photos, selectedRug?.clientId, selectedRug?.id, washDecision]);

  const validateDetailsStep = useCallback(async () => {
    const valid = await form.trigger(["rugNumber", "clientName", "rugType", "length", "width"]);
    if (!valid) return false;
    await resolveClientLookup(form.getValues("clientName"), selectedRug?.clientId ?? null);
    return true;
  }, [form, resolveClientLookup, selectedRug?.clientId]);

  const handleAdvanceFromDetails = useCallback(async () => {
    const valid = await validateDetailsStep();
    if (!valid) return;
    setStep("photos");
  }, [validateDetailsStep]);

  const handleAdvanceFromPhotos = useCallback(() => {
    if (photos.length < 1) {
      toast({ title: "Photos required", description: "Upload at least 1 photo.", variant: "destructive" });
      return;
    }
    setStep("decision");
  }, [photos.length]);

  const handleDecisionContinue = useCallback(async () => {
    if (washDecision === "standard") {
      if (!shouldLoadServices) {
        setShouldLoadServices(true);
      }
      if (!standardWashService) {
        toast({ title: "Standard Wash unavailable", description: "The Standard Wash service was not found.", variant: "destructive" });
        return;
      }
      await submitCheckIn([standardWashService.id]);
      return;
    }

    setStep("services");
  }, [shouldLoadServices, standardWashService, submitCheckIn, washDecision]);

  const progressStep = step === "details" ? 1 : step === "photos" ? 2 : step === "decision" ? 3 : 4;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[1.5rem] bg-transparent">
      <div className="border-b border-border/70 bg-[linear-gradient(135deg,rgba(31,122,232,0.96),rgba(59,108,235,0.92)_48%,rgba(109,66,230,0.88))] px-4 py-5 text-primary-foreground md:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary-foreground/80">Check In</p>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold tracking-[-0.025em]">
                {values.rugNumber || selectedRug?.rugNumber || editingEntry?.rugNumber || "New intake"}
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-sm text-primary-foreground/88">
                <span>{values.clientName || selectedRug?.clientName || editingEntry?.clientName || "No client selected yet"}</span>
                {tierLabel && <span className="rounded-full border border-white/16 bg-white/14 px-2.5 py-1 text-[11px] font-medium">{tierLabel}</span>}
                {isEditing && <span className="rounded-full border border-white/16 bg-white/14 px-2.5 py-1 text-[11px] font-medium">Editing</span>}
              </div>
            </div>
          </div>
          <div className="min-w-[12rem] rounded-2xl border border-white/14 bg-white/10 px-4 py-3 text-sm text-primary-foreground/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">Current step</p>
            <p className="mt-1 text-sm font-medium text-primary-foreground">{step === "details" ? "Rug details" : step === "photos" ? "Photos" : step === "decision" ? "Cleaning decision" : "Custom services"}</p>
            <p className="mt-1 text-xs text-primary-foreground/70">Step {progressStep} of {washDecision === "custom" || step === "services" ? 4 : 3}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.24),rgba(245,248,255,0.14))] p-4 md:p-5">
        <div className="space-y-5">
        {selectedRug?.estimateRequested && (
          <Alert variant="default" className="border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTitle>Estimate requested</AlertTitle>
            <AlertDescription>
              The client requested an estimate for this rug. {selectedRug.estimateRequestDetails?.trim()
                ? `Details: ${selectedRug.estimateRequestDetails}`
                : "Review services and create/send estimate as needed."}
            </AlertDescription>
          </Alert>
        )}

        {step === "details" && (
          <StepShell eyebrow="Details" title="Tell us about the rug" description="Start with the essential intake details. Keep this step focused and lightweight.">
            {isReadOnlyIdentity ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Rug #</Label>
                  <p className="font-mono text-lg font-bold">{values.rugNumber}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Client</Label>
                  <p className="text-base font-medium">{values.clientName}</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Rug #</Label>
                  <Input
                    placeholder="e.g. R-4521"
                    autoFocus
                    value={values.rugNumber}
                    onChange={(event) => form.setValue("rugNumber", event.target.value, { shouldValidate: true })}
                  />
                  <p className="text-sm text-destructive">{form.formState.errors.rugNumber?.message}</p>
                </div>
                <div className="space-y-2">
                  <Label>Client Name</Label>
                  <Input
                    placeholder="Client name"
                    value={values.clientName}
                    onChange={(event) => {
                      setKnownClientId(null);
                      form.setValue("clientName", event.target.value, { shouldValidate: true });
                    }}
                    onBlur={() => {
                      void resolveClientLookup(form.getValues("clientName"));
                    }}
                  />
                  <p className="text-sm text-destructive">{form.formState.errors.clientName?.message}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="col-span-2 space-y-2 sm:col-span-1">
                <Label>Rug Type</Label>
                <Select value={values.rugType} onValueChange={(value) => form.setValue("rugType", value, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {RUG_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-destructive">{form.formState.errors.rugType?.message}</p>
              </div>
              <div className="space-y-2">
                <Label>Length (ft)</Label>
                <Input type="number" step="0.1" inputMode="decimal" value={values.length || ""} onChange={(event) => form.setValue("length", Number(event.target.value), { shouldValidate: true })} />
                <p className="text-sm text-destructive">{form.formState.errors.length?.message}</p>
              </div>
              <div className="space-y-2">
                <Label>Width (ft)</Label>
                <Input type="number" step="0.1" inputMode="decimal" value={values.width || ""} onChange={(event) => form.setValue("width", Number(event.target.value), { shouldValidate: true })} />
                <p className="text-sm text-destructive">{form.formState.errors.width?.message}</p>
              </div>
            </div>

            {sqft > 0 && (
              <p className="text-sm text-muted-foreground">
                Area: <span className="font-medium text-foreground">{sqft.toFixed(1)} sq ft</span>
                {linearFt > 0 && <> · Perimeter: <span className="font-medium text-foreground">{linearFt.toFixed(1)} linear ft</span></>}
              </p>
            )}

            <div className="space-y-2">
              <Label>Condition Notes</Label>
              <Textarea
                placeholder="Stains, damage, special instructions…"
                className="min-h-[84px]"
                value={values.conditionNotes}
                onChange={(event) => form.setValue("conditionNotes", event.target.value)}
              />
            </div>
          </StepShell>
        )}

        {step === "photos" && (
          <StepShell eyebrow="Photos" title="Capture photos" description="Document the rug clearly, then move on. This step stays separate so the intake form remains calm.">
            <MemoizedCheckInPhotoSection photos={photos} onPhotosChange={setPhotos} />
          </StepShell>
        )}

        {step === "decision" && (
          <StepShell eyebrow="Decision" title="Standard cleaning?" description="Most rugs should finish here. Only open custom services when extra work is actually needed.">
            <RadioGroup value={washDecision} onValueChange={(value) => setWashDecision(value as WashDecision)} className="space-y-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-[1.1rem] border border-border/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(246,248,255,0.88))] px-4 py-4 shadow-[0_10px_24px_-22px_rgba(51,84,181,0.16)] transition-colors hover:bg-white">
                <RadioGroupItem value="standard" id="wash-standard" />
                <div>
                  <p className="text-sm font-medium">Yes, standard wash only</p>
                  <p className="text-xs text-muted-foreground">Use the existing Standard Wash service and finish immediately.</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-[1.1rem] border border-border/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(246,248,255,0.88))] px-4 py-4 shadow-[0_10px_24px_-22px_rgba(51,84,181,0.16)] transition-colors hover:bg-white">
                <RadioGroupItem value="custom" id="wash-custom" />
                <div>
                  <p className="text-sm font-medium">No, additional services needed</p>
                  <p className="text-xs text-muted-foreground">Open the custom services step for repair, specialty treatment, protection, or custom pricing.</p>
                </div>
              </label>
            </RadioGroup>
          </StepShell>
        )}

        {step === "services" && (
          <StepShell eyebrow="Services" title="Custom services" description="Only mounted when needed, so the common path stays fast and uncluttered.">
            {shouldLoadServices ? (
              <MemoizedCheckInServiceSelector
                dbServices={dbServices}
                watchedServices={selectedServices}
                toggleService={toggleService}
                clearAll={() => {
                  form.setValue("selectedServices", [], { shouldValidate: true });
                  setFlatPrices({});
                  setEdgeSelections({});
                }}
                setServices={(ids) => form.setValue("selectedServices", ids, { shouldValidate: true })}
                getUnitPrice={getUnitPrice}
                getLineTotal={getLineTotal}
                edgeSelections={edgeSelections}
                setEdgeSelections={setEdgeSelections}
                flatPrices={flatPrices}
                setFlatPrices={setFlatPrices}
                watchedLength={length}
                watchedWidth={width}
                tierLabel={tierLabel}
                error={form.formState.errors.selectedServices?.message}
              />
            ) : (
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-6 text-sm text-muted-foreground">Loading services…</div>
            )}
          </StepShell>
        )}
        </div>
      </div>

      <div className="border-t border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,255,0.88))] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {step === "details" && "Capture core rug details first"}
            {step === "photos" && `${photos.length} photo${photos.length !== 1 ? "s" : ""} added`}
            {step === "decision" && (washDecision === "standard" ? "Standard wash fast path" : "Continue to custom services")}
            {step === "services" && (hasSelectedServices ? `${selectedServices.length} service${selectedServices.length !== 1 ? "s" : ""} selected` : "Select at least one service")}
          </div>
          <div className="flex items-center gap-2">
            {step !== "details" && (
              <Button type="button" variant="outline" onClick={() => setStep(step === "photos" ? "details" : step === "decision" ? "photos" : "decision")}>
                Back
              </Button>
            )}
            {step === "details" && (
              <Button type="button" onClick={() => void handleAdvanceFromDetails()}>Continue to Photos</Button>
            )}
            {step === "photos" && (
              <Button type="button" onClick={handleAdvanceFromPhotos}>Continue</Button>
            )}
            {step === "decision" && (
              <Button type="button" onClick={() => void handleDecisionContinue()}>
                {washDecision === "standard" ? (isEditing ? "Update" : "Complete Check-In") : "Continue to Services"}
              </Button>
            )}
            {step === "services" && (
              <Button type="button" onClick={() => void submitCheckIn(selectedServices)}>
                {isEditing ? "Update" : "Complete Check-In"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
