import { useForm } from "react-hook-form";
import { Loader2, Search, Check } from "lucide-react";
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
import { toast } from "@/hooks/use-toast";
import { RUG_TYPES } from "@/data/services";
import { type PendingRug } from "@/types/pending-rug";
import { type CheckInEntry } from "@/data/check-in-log";
import { supabase } from "@/integrations/supabase/client";
import { calcSelectedLinearFt, type RugEdge } from "@/lib/rug-edges";

import { CheckInPhotoSection, type PhotoItem } from "./CheckInPhotoSection";
import { CheckInServiceSelector, type DbService } from "./CheckInServiceSelector";

type PricingTier = "standard" | "preferred" | "vip";

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
    serviceSnapshots: { service_id: string; service_name: string; quoted_price?: number | null; edges: string[] }[];
    totalPrice?: number;
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
  const [clientSearch, setClientSearch] = useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = useState("");

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

  useEffect(() => {
    const trimmed = clientSearch.trim();
    const timer = window.setTimeout(() => {
      setDebouncedClientSearch(trimmed);
    }, 160);
    return () => window.clearTimeout(timer);
  }, [clientSearch]);

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
      setClientSearch(selectedRug.clientName);
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
      setClientSearch(editingEntry.clientName);
      void resolveClientLookup(editingEntry.clientName);
    }
  }, [editingEntry, form, resolveClientLookup]);

  const { data: matchingClients = [], isFetching: searchingClients } = useQuery({
    queryKey: ["checkin", "client-lookup", debouncedClientSearch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, pricing_tier")
        .ilike("name", `%${debouncedClientSearch}%`)
        .order("name")
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
    enabled: debouncedClientSearch.length >= 2,
    staleTime: 30_000,
  });

  const { data: dbServices = [] } = useQuery({
    queryKey: ["services", "active", "checkin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, unit, base_price, preferred_price, vip_price, category, requires_estimate")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as DbService[];
    },
    staleTime: 5 * 60_000,
    enabled: true,
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

  const requiresCustomPrice = useCallback((svc: DbService) => {
    return svc.unit === "flat" && Boolean(svc.requires_estimate);
  }, []);

  const serviceById = useMemo(() => {
    const map = new Map<string, DbService>();
    for (const svc of dbServices) map.set(svc.id, svc);
    return map;
  }, [dbServices]);

  const buildServiceSnapshots = useCallback((selectedServiceIds: string[]) => {
    return selectedServiceIds
      .map((id) => {
        const svc = serviceById.get(id);
        if (!svc) return null;
        const edges = svc.unit === "per linear ft" ? (edgeSelections[id] ?? []) : [];
        const quotedPrice = requiresCustomPrice(svc)
          ? (() => {
              const manual = parseFloat(flatPrices[id] ?? "");
              return Number.isNaN(manual) ? null : manual;
            })()
          : null;
        return { service_id: id, service_name: svc.name, quoted_price: quotedPrice, edges };
      })
      .filter(Boolean) as { service_id: string; service_name: string; quoted_price?: number | null; edges: string[] }[];
  }, [edgeSelections, flatPrices, requiresCustomPrice, serviceById]);

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
      return;
    }

    if (photos.length < 1) {
      toast({ title: "Photos required", description: "Upload at least 1 photo.", variant: "destructive" });
      return;
    }

    const serviceSnapshots = buildServiceSnapshots(selectedServiceIds);
    if (serviceSnapshots.length === 0) {
      toast({ title: "Select a service", description: "Choose Standard Wash or add custom services.", variant: "destructive" });
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
          totalPrice: undefined,
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
    }

    toast({
      title: result.title,
      description: result.description,
      variant: result.status === "error" ? "destructive" : "default",
    });
  }, [buildServiceSnapshots, form, isEditing, knownClientId, onCheckInComplete, photos, selectedRug?.clientId, selectedRug?.id]);

  const validateForm = useCallback(async () => {
    const valid = await form.trigger(["rugNumber", "clientName", "rugType", "length", "width"]);
    if (!valid) return false;
    if (!knownClientId) {
      form.setError("clientName", { message: "Select an existing client before continuing." });
      return false;
    }
    return true;
  }, [form, knownClientId]);

  const handleSubmitCurrent = useCallback(async () => {
    const valid = await validateForm();
    if (!valid) return;

    if (photos.length < 1) {
      toast({ title: "Photos required", description: "Upload at least 1 photo.", variant: "destructive" });
      return;
    }

    await submitCheckIn(selectedServices);
  }, [photos.length, selectedServices, submitCheckIn, validateForm]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-[1.5rem] bg-transparent">
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

        <StepShell title="Check in" description="">
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
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search existing client"
                      value={values.clientName}
                      className="pl-9 pr-9"
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setKnownClientId(null);
                        setClientSearch(nextValue);
                        form.setValue("clientName", nextValue, { shouldValidate: true });
                      }}
                    />
                    {searchingClients ? (
                      <Loader2 className="absolute right-3 top-3.5 h-4 w-4 animate-spin text-muted-foreground" />
                    ) : null}
                  </div>

                  <div className="min-h-[4.5rem] rounded-xl border border-border/70 bg-white/96 p-2 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.12)]">
                    {knownClientId && values.clientName.trim() ? (
                      <div className="flex min-h-[3.5rem] items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                        <Check className="h-4 w-4" />
                        Existing client selected
                      </div>
                    ) : debouncedClientSearch.length < 2 ? (
                      <div className="flex min-h-[3.5rem] items-center px-3 text-xs text-muted-foreground">
                        Type at least 2 letters to search existing clients.
                      </div>
                    ) : matchingClients.length === 0 ? (
                      <div className="flex min-h-[3.5rem] items-center px-3 text-xs text-muted-foreground">
                        No existing client match found.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {matchingClients.map((client) => (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => {
                              setKnownClientId(client.id);
                              setClientSearch(client.name);
                              setClientTier((client.pricing_tier as PricingTier | undefined) ?? "standard");
                              form.setValue("clientName", client.name, { shouldValidate: true });
                            }}
                            className="flex min-h-[3rem] w-full items-center rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                          >
                            {client.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <p className="min-h-[1.25rem] text-sm text-destructive">{form.formState.errors.clientName?.message}</p>
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
              <Label>Width (ft)</Label>
              <Input type="number" step="0.1" inputMode="decimal" value={values.width || ""} onChange={(event) => form.setValue("width", Number(event.target.value), { shouldValidate: true })} />
              <p className="text-sm text-destructive">{form.formState.errors.width?.message}</p>
            </div>
            <div className="space-y-2">
              <Label>Length (ft)</Label>
              <Input type="number" step="0.1" inputMode="decimal" value={values.length || ""} onChange={(event) => form.setValue("length", Number(event.target.value), { shouldValidate: true })} />
              <p className="text-sm text-destructive">{form.formState.errors.length?.message}</p>
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

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
            <div className="space-y-3 rounded-[1.1rem] border border-border/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(246,248,255,0.88))] p-4 shadow-[0_10px_24px_-22px_rgba(51,84,181,0.16)]">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Photos</p>
                <p className="text-xs text-muted-foreground">Upload at least one photo. This area stays mounted so the page geometry stays calm.</p>
              </div>
              <MemoizedCheckInPhotoSection photos={photos} onPhotosChange={setPhotos} />
            </div>

            <div className="min-h-[26rem] rounded-[1.1rem] border border-border/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(246,248,255,0.88))] p-4 shadow-[0_10px_24px_-22px_rgba(51,84,181,0.16)]">
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Custom services</p>
                  <p className="text-xs text-muted-foreground">Add the services this rug actually needs.</p>
                </div>
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
                  requiresCustomPrice={requiresCustomPrice}
                  edgeSelections={edgeSelections}
                  setEdgeSelections={setEdgeSelections}
                  flatPrices={flatPrices}
                  setFlatPrices={setFlatPrices}
                  watchedLength={length}
                  watchedWidth={width}
                  tierLabel={null}
                  error={form.formState.errors.selectedServices?.message}
                />
              </div>
            </div>
          </div>
        </StepShell>
        </div>
      </div>

      <div className="border-t border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,255,0.88))] px-4 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-muted-foreground">
            {hasSelectedServices
              ? `${selectedServices.length} service${selectedServices.length !== 1 ? "s" : ""} selected · ${photos.length} photo${photos.length !== 1 ? "s" : ""} added`
              : `${photos.length} photo${photos.length !== 1 ? "s" : ""} added · Select at least one service`}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" className="rounded-xl" onClick={() => void handleSubmitCurrent()}>
              {isEditing ? "Update" : "Complete Check-In"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
