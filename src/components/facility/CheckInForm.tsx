import { useForm, useWatch } from "react-hook-form";
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
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
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

const MemoizedCheckInPhotoSection = memo(CheckInPhotoSection);
const MemoizedCheckInServiceSelector = memo(CheckInServiceSelector);

type PricingTier = "standard" | "preferred" | "vip";
type IntakeStep = "details" | "services";
type WashDecision = "standard" | "custom";

type ClientLookupCache = Record<string, { id: string | null; tier: PricingTier }>;

type IdleHandle = number;
type WindowWithIdleCallback = Window & typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => IdleHandle;
  cancelIdleCallback?: (handle: IdleHandle) => void;
};

const CLIENT_LOOKUP_CACHE_KEY = "checkin-client-lookup-cache-v1";
const STANDARD_WASH_SERVICE_NAME = "Standard Wash";

const checkInSchema = z.object({
  rugNumber: z.string().min(1, "Rug number is required"),
  clientName: z.string().min(1, "Client name is required"),
  rugType: z.string().min(1, "Rug type is required"),
  length: z.coerce.number().positive("Length must be positive"),
  width: z.coerce.number().positive("Width must be positive"),
  conditionNotes: z.string().optional(),
  selectedServices: z.array(z.string()),
});

type CheckInValues = z.infer<typeof checkInSchema>;

const EMPTY_CHECKIN_VALUES: CheckInValues = {
  rugNumber: "",
  clientName: "",
  rugType: "",
  length: undefined as unknown as number,
  width: undefined as unknown as number,
  conditionNotes: "",
  selectedServices: [],
};

interface CheckInResult {
  status: "success" | "warning" | "error";
  title: string;
  description: string;
  resetForm?: boolean;
}

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
  }) => Promise<CheckInResult | void>;
}

export function CheckInForm({ selectedRug, editingEntry, onCheckInComplete }: CheckInFormProps) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [clientTier, setClientTier] = useState<PricingTier>("standard");
  const [knownClientId, setKnownClientId] = useState<string | null>(selectedRug?.clientId ?? null);
  const [shouldLoadServices, setShouldLoadServices] = useState(false);
  const clientLookupCacheRef = useRef<ClientLookupCache>({});
  const [flatPrices, setFlatPrices] = useState<Record<string, string>>({});
  const [edgeSelections, setEdgeSelections] = useState<Record<string, RugEdge[]>>({});
  const [step, setStep] = useState<IntakeStep>("details");
  const [washDecision, setWashDecision] = useState<WashDecision>("standard");

  const form = useForm<CheckInValues>({
    resolver: zodResolver(checkInSchema),
    defaultValues: EMPTY_CHECKIN_VALUES,
  });

  const { data: dbServices = [] } = useQuery({
    queryKey: ["services", "active", "checkin"],
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

  useEffect(() => {
    if (selectedRug || editingEntry || step === "services") {
      setShouldLoadServices(true);
      return;
    }

    const win = window as WindowWithIdleCallback;
    if (typeof win.requestIdleCallback === "function") {
      const handle = win.requestIdleCallback(() => {
        setShouldLoadServices(true);
      }, { timeout: 1200 });
      return () => {
        if (typeof win.cancelIdleCallback === "function") {
          win.cancelIdleCallback(handle);
        }
      };
    }

    const timer = window.setTimeout(() => {
      setShouldLoadServices(true);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [selectedRug, editingEntry, step]);

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
      const preSelectedIds = (selectedRug.requestedServices ?? [])
        .map((name) => dbServices.find((s) => s.name.toLowerCase() === name.toLowerCase())?.id)
        .filter(Boolean) as string[];

      form.reset({
        rugNumber: selectedRug.rugNumber,
        clientName: selectedRug.clientName,
        rugType: selectedRug.rugType ?? "",
        length: selectedRug.length ?? undefined,
        width: selectedRug.width ?? undefined,
        conditionNotes: "",
        selectedServices: preSelectedIds,
      });
      setPhotos([]);
      setKnownClientId(selectedRug.clientId ?? null);
      setStep(preSelectedIds.length > 0 ? "services" : "details");
      setWashDecision(preSelectedIds.length > 0 ? "custom" : "standard");
      void resolveClientLookup(selectedRug.clientName, selectedRug.clientId ?? null);
    }
  }, [selectedRug, form, dbServices, resolveClientLookup]);

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
      setKnownClientId(null);
      setStep(editingEntry.services.length > 1 ? "services" : "details");
      setWashDecision(editingEntry.services.some((s) => s.name !== STANDARD_WASH_SERVICE_NAME) ? "custom" : "standard");
      void resolveClientLookup(editingEntry.clientName);
    }
  }, [editingEntry, form, resolveClientLookup]);

  const watchedRugNumber = useWatch({ control: form.control, name: "rugNumber" });
  const watchedClient = useWatch({ control: form.control, name: "clientName" });
  const watchedLength = useWatch({ control: form.control, name: "length" });
  const watchedWidth = useWatch({ control: form.control, name: "width" });
  const watchedServices = useWatch({ control: form.control, name: "selectedServices" }) ?? [];

  const dimensions = useMemo(() => {
    const length = Number(watchedLength) || 0;
    const width = Number(watchedWidth) || 0;
    const sqftValue = length * width;
    const linearFtValue = length > 0 && width > 0 ? 2 * (length + width) : 0;
    return { length, width, sqft: sqftValue, linearFt: linearFtValue };
  }, [watchedLength, watchedWidth]);

  const sqft = dimensions.sqft;
  const linearFt = dimensions.linearFt;

  const getUnitPrice = useCallback(
    (svc: DbService): number => {
      switch (clientTier) {
        case "vip": return Number(svc.vip_price);
        case "preferred": return Number(svc.preferred_price);
        default: return Number(svc.base_price);
      }
    },
    [clientTier]
  );

  const servicePricing = useMemo(() => {
    const pricing = new Map<string, { unitPrice: number; rawTotal: number; adjustedTotal: number }>();

    for (const svc of dbServices) {
      const unitPrice = getUnitPrice(svc);
      let rawTotal = unitPrice;

      if (svc.unit === "per sqft") {
        rawTotal = unitPrice * sqft;
      } else if (svc.unit === "per linear ft") {
        const edges = edgeSelections[svc.id] ?? [];
        rawTotal = unitPrice * calcSelectedLinearFt(edges, dimensions.length, dimensions.width);
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
  }, [dbServices, getUnitPrice, sqft, edgeSelections, flatPrices, dimensions.length, dimensions.width]);

  const getLineTotal = useCallback(
    (svc: DbService): number => servicePricing.get(svc.id)?.adjustedTotal ?? 0,
    [servicePricing]
  );

  const serviceById = useMemo(() => {
    const map = new Map<string, DbService>();
    for (const svc of dbServices) map.set(svc.id, svc);
    return map;
  }, [dbServices]);

  const standardWashService = useMemo(
    () => dbServices.find((svc) => svc.name.toLowerCase() === STANDARD_WASH_SERVICE_NAME.toLowerCase()) ?? null,
    [dbServices]
  );

  const hasSelectedServices = watchedServices.length > 0;

  const toggleService = (serviceId: string) => {
    const current = form.getValues("selectedServices");
    const next = current.includes(serviceId)
      ? current.filter((id) => id !== serviceId)
      : [...current, serviceId];
    form.setValue("selectedServices", next, { shouldValidate: true });
  };

  const resetIntakeState = useCallback(() => {
    form.reset(EMPTY_CHECKIN_VALUES);
    setPhotos([]);
    setFlatPrices({});
    setEdgeSelections({});
    setClientTier("standard");
    setKnownClientId(null);
    setStep("details");
    setWashDecision("standard");
  }, [form]);

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

  const submitCheckIn = useCallback(async (data: CheckInValues, selectedServiceIds: string[]) => {
    if (!editingEntry && photos.length < 1) {
      toast({ title: "Photos required", description: "Upload at least 1 photo.", variant: "destructive" });
      return;
    }

    const isEditing = !!editingEntry;
    const label = isEditing ? "updated" : "checked in";
    const serviceSnapshots = buildServiceSnapshots(selectedServiceIds);

    if (serviceSnapshots.length === 0) {
      toast({ title: "Select a service", description: "Choose Standard Wash or open additional services.", variant: "destructive" });
      return;
    }

    const result = onCheckInComplete
      ? await onCheckInComplete({
          rugId: selectedRug?.id,
          clientId: knownClientId ?? selectedRug?.clientId ?? null,
          rugNumber: data.rugNumber,
          clientName: data.clientName,
          rugType: data.rugType,
          length: data.length,
          width: data.width,
          selectedServices: selectedServiceIds,
          serviceSnapshots,
          totalPrice: serviceSnapshots.reduce((sum, service) => sum + service.line_total, 0),
          conditionNotes: data.conditionNotes?.trim() ?? "",
          photos: photos.map((photo) => photo.file),
        })
      : { status: "success", title: isEditing ? "Entry updated" : "Check-in complete", description: `Rug ${data.rugNumber} ${label}.`, resetForm: true };

    if (result) {
      toast({ title: result.title, description: result.description, variant: result.status === "error" ? "destructive" : undefined });
      if (result.resetForm !== false) {
        resetIntakeState();
      }
    }
  }, [buildServiceSnapshots, editingEntry, knownClientId, onCheckInComplete, photos, resetIntakeState, selectedRug?.clientId, selectedRug?.id]);

  const handleDetailsSubmit = form.handleSubmit(async (data) => {
    if (washDecision === "standard") {
      if (!standardWashService) {
        toast({ title: "Standard Wash unavailable", description: "The Standard Wash service was not found.", variant: "destructive" });
        return;
      }
      await submitCheckIn(data, [standardWashService.id]);
      return;
    }

    setStep("services");
  });

  const handleServicesSubmit = form.handleSubmit(async (data) => {
    await submitCheckIn(data, data.selectedServices);
  });

  const isFromPanel = !!selectedRug;
  const isEditing = !!editingEntry;
  const isReadOnlyIdentity = isFromPanel || isEditing;
  const tierLabel = clientTier !== "standard" ? clientTier.charAt(0).toUpperCase() + clientTier.slice(1) : null;

  return (
    <Form {...form}>
      <form onSubmit={(event) => event.preventDefault()} className="flex flex-col h-full">
        <div className={`sticky top-0 z-10 px-3 md:px-4 py-2.5 md:py-3 rounded-t-lg flex items-center justify-between ${
          isEditing ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
        }`}>
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <span className="text-base md:text-lg font-bold font-mono truncate">
              {watchedRugNumber || "—"}
            </span>
            <span className="text-xs md:text-sm opacity-80 truncate hidden sm:inline">
              {watchedClient || "No client"}
            </span>
            {tierLabel && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded shrink-0">{tierLabel}</span>
            )}
            {isEditing && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded shrink-0">Editing</span>
            )}
          </div>
          <span className="text-xs md:text-sm font-medium shrink-0 opacity-90">
            {step === "details" ? "Intake details" : hasSelectedServices ? `${watchedServices.length} selected` : "Additional services"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 md:space-y-6">
          {selectedRug?.estimateRequested && (
            <Alert variant="default" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100">
              <AlertTitle>Estimate requested</AlertTitle>
              <AlertDescription>
                The client requested an estimate for this rug. {selectedRug.estimateRequestDetails?.trim()
                  ? `Details: ${selectedRug.estimateRequestDetails}`
                  : "Review services and create/send estimate as needed."}
              </AlertDescription>
            </Alert>
          )}

          {isReadOnlyIdentity ? (
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Rug #</Label>
                <p className="font-mono font-bold text-base md:text-lg">{watchedRugNumber}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Client</Label>
                <p className="font-medium text-sm md:text-base">{watchedClient}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              <FormField
                control={form.control}
                name="rugNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rug #</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. R-4521" autoFocus {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="clientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Client name"
                        {...field}
                        onChange={(event) => {
                          setKnownClientId(null);
                          field.onChange(event);
                        }}
                        onBlur={(event) => {
                          field.onBlur();
                          void resolveClientLookup(event.target.value);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 md:gap-4">
            <FormField
              control={form.control}
              name="rugType"
              render={({ field }) => (
                <FormItem className="col-span-2 sm:col-span-1">
                  <FormLabel>Rug Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {RUG_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="length"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Length (ft)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" placeholder="0.0" inputMode="decimal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="width"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Width (ft)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" placeholder="0.0" inputMode="decimal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {sqft > 0 && (
            <p className="text-xs md:text-sm text-muted-foreground">
              Area: <span className="font-medium text-foreground">{sqft.toFixed(1)} sq ft</span>
              {linearFt > 0 && (
                <> · Perimeter: <span className="font-medium text-foreground">{linearFt.toFixed(1)} linear ft</span></>
              )}
            </p>
          )}

          <FormField
            control={form.control}
            name="conditionNotes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Condition Notes</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Stains, damage, special instructions…"
                    className="min-h-[60px]"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <MemoizedCheckInPhotoSection
            photos={photos}
            onPhotosChange={setPhotos}
          />

          {step === "details" ? (
            <div className="rounded-md border border-border bg-background px-4 py-4 space-y-3">
              <div>
                <p className="text-sm font-medium">Standard wash?</p>
                <p className="text-xs text-muted-foreground">Most rugs should finish here. Choose No only if you need extra services.</p>
              </div>
              <RadioGroup value={washDecision} onValueChange={(value) => setWashDecision(value as WashDecision)} className="space-y-2">
                <label className="flex items-center gap-3 rounded-md border border-border px-3 py-3 cursor-pointer hover:bg-muted/30">
                  <RadioGroupItem value="standard" id="wash-standard" />
                  <div>
                    <p className="text-sm font-medium">Yes, standard wash only</p>
                    <p className="text-xs text-muted-foreground">Auto-uses the existing Standard Wash service and submits immediately.</p>
                  </div>
                </label>
                <label className="flex items-center gap-3 rounded-md border border-border px-3 py-3 cursor-pointer hover:bg-muted/30">
                  <RadioGroupItem value="custom" id="wash-custom" />
                  <div>
                    <p className="text-sm font-medium">No, additional services needed</p>
                    <p className="text-xs text-muted-foreground">Continue to the services page for special wash, repairs, protection, or custom pricing.</p>
                  </div>
                </label>
              </RadioGroup>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-3">
                <div>
                  <p className="text-sm font-medium">Additional services</p>
                  <p className="text-xs text-muted-foreground">
                    {hasSelectedServices
                      ? `${watchedServices.length} selected`
                      : "Choose all services needed for this rug"}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setStep("details")}>
                  Back
                </Button>
              </div>

              {shouldLoadServices ? (
                <MemoizedCheckInServiceSelector
                  dbServices={dbServices}
                  watchedServices={watchedServices}
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
                  watchedLength={dimensions.length}
                  watchedWidth={dimensions.width}
                  tierLabel={tierLabel}
                  error={form.formState.errors.selectedServices?.message}
                />
              ) : (
                <div className="rounded-md border border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                  Loading services…
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 border-t border-border bg-background rounded-b-lg shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <div className="px-3 md:px-4 py-2.5 md:py-3 flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {step === "details"
                ? washDecision === "standard"
                  ? "Standard wash fast path"
                  : "Continue to additional services"
                : hasSelectedServices
                  ? `${watchedServices.length} service${watchedServices.length !== 1 ? "s" : ""} selected`
                  : "Select at least one service"}
            </div>
            {step === "details" ? (
              <Button type="button" size="lg" className="h-10 md:h-11 px-4 md:px-6" onClick={() => void handleDetailsSubmit()}>
                {washDecision === "standard" ? (isEditing ? "Update" : "Complete Check-In") : "Continue to Services"}
              </Button>
            ) : (
              <Button type="button" size="lg" className="h-10 md:h-11 px-4 md:px-6" onClick={() => void handleServicesSubmit()}>
                {isEditing ? "Update" : "Complete Check-In"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}
