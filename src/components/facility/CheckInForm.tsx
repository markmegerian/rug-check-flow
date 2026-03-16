import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useState } from "react";

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
import { toast } from "@/hooks/use-toast";
import { RUG_TYPES } from "@/data/services";
import { type PendingRug } from "@/types/pending-rug";
import { type CheckInEntry } from "@/data/check-in-log";
import { supabase } from "@/integrations/supabase/client";
import { calcSelectedLinearFt, type RugEdge } from "@/lib/rug-edges";

import { CheckInPhotoSection, type PhotoItem } from "./CheckInPhotoSection";
import { CheckInServiceSelector, type DbService } from "./CheckInServiceSelector";

type PricingTier = "standard" | "preferred" | "vip";

const checkInSchema = z.object({
  rugNumber: z.string().min(1, "Rug number is required"),
  clientName: z.string().min(1, "Client name is required"),
  rugType: z.string().min(1, "Rug type is required"),
  length: z.coerce.number().positive("Length must be positive"),
  width: z.coerce.number().positive("Width must be positive"),
  conditionNotes: z.string().optional(),
  selectedServices: z.array(z.string()).min(1, "Select at least one service"),
});

type CheckInValues = z.infer<typeof checkInSchema>;

interface CheckInFormProps {
  selectedRug?: PendingRug | null;
  editingEntry?: CheckInEntry | null;
  onCheckInComplete?: (data: {
    rugId?: string;
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
  }) => void;
}

export function CheckInForm({ selectedRug, editingEntry, onCheckInComplete }: CheckInFormProps) {
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [dbServices, setDbServices] = useState<DbService[]>([]);
  const [clientTier, setClientTier] = useState<PricingTier>("standard");
  const [flatPrices, setFlatPrices] = useState<Record<string, string>>({});
  const [edgeSelections, setEdgeSelections] = useState<Record<string, RugEdge[]>>({});

  const form = useForm<CheckInValues>({
    resolver: zodResolver(checkInSchema),
    defaultValues: {
      rugNumber: "",
      clientName: "",
      rugType: "",
      length: undefined,
      width: undefined,
      conditionNotes: "",
      selectedServices: [],
    },
  });

  useEffect(() => {
    async function fetchServices() {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, unit, base_price, preferred_price, vip_price, category")
        .eq("active", true)
        .order("name");
      if (!error && data) {
        setDbServices(data as DbService[]);
      }
    }
    fetchServices();
  }, []);

  useEffect(() => {
    if (selectedRug) {
      form.reset({
        rugNumber: selectedRug.rugNumber,
        clientName: selectedRug.clientName,
        rugType: selectedRug.rugType ?? "",
        length: selectedRug.length ?? undefined,
        width: selectedRug.width ?? undefined,
        conditionNotes: "",
        selectedServices: [],
      });
      setPhotos([]);
    }
  }, [selectedRug, form]);

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
    }
  }, [editingEntry, form]);

  const watchedClient = form.watch("clientName");
  const watchedLength = form.watch("length");
  const watchedWidth = form.watch("width");
  const watchedServices = form.watch("selectedServices");

  useEffect(() => {
    if (!watchedClient) {
      setClientTier("standard");
      return;
    }
    let cancelled = false;
    const lookup = async () => {
      const { data } = await supabase
        .from("clients")
        .select("pricing_tier")
        .ilike("name", watchedClient)
        .limit(1);
      if (!cancelled && data?.[0]) {
        setClientTier(data[0].pricing_tier as PricingTier);
      } else if (!cancelled) {
        setClientTier("standard");
      }
    };
    const timer = setTimeout(lookup, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [watchedClient]);

  const sqft = useMemo(() => {
    const l = Number(watchedLength) || 0;
    const w = Number(watchedWidth) || 0;
    return l * w;
  }, [watchedLength, watchedWidth]);

  const linearFt = useMemo(() => {
    const l = Number(watchedLength) || 0;
    const w = Number(watchedWidth) || 0;
    return 2 * (l + w);
  }, [watchedLength, watchedWidth]);

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

  const getLineTotal = useCallback(
    (svc: DbService): number => {
      const unitPrice = getUnitPrice(svc);
      if (svc.unit === "per sqft") return unitPrice * sqft;
      if (svc.unit === "per linear ft") {
        const edges = edgeSelections[svc.id] ?? [];
        const l = Number(watchedLength) || 0;
        const w = Number(watchedWidth) || 0;
        return unitPrice * calcSelectedLinearFt(edges, l, w);
      }
      if (svc.unit === "flat") {
        const manual = parseFloat(flatPrices[svc.id] ?? "");
        return isNaN(manual) ? 0 : manual;
      }
      return unitPrice;
    },
    [getUnitPrice, sqft, edgeSelections, flatPrices, watchedLength, watchedWidth]
  );

  const serviceById = useMemo(() => {
    const map = new Map<string, DbService>();
    for (const svc of dbServices) map.set(svc.id, svc);
    return map;
  }, [dbServices]);

  const totalPrice = useMemo(() => {
    return watchedServices.reduce((sum, id) => {
      const svc = serviceById.get(id);
      return svc ? sum + getLineTotal(svc) : sum;
    }, 0);
  }, [watchedServices, serviceById, getLineTotal]);

  const toggleService = (serviceId: string) => {
    const current = form.getValues("selectedServices");
    const next = current.includes(serviceId)
      ? current.filter((id) => id !== serviceId)
      : [...current, serviceId];
    form.setValue("selectedServices", next, { shouldValidate: true });
  };

  const onSubmit = (data: CheckInValues) => {
    if (!editingEntry && photos.length < 1) {
      toast({ title: "Photos required", description: "Upload at least 1 photo.", variant: "destructive" });
      return;
    }

    const isEditing = !!editingEntry;
    const label = isEditing ? "updated" : "checked in";

    console.log(`Check-in ${label}:`, { ...data, photos: photos.length, totalPrice });
    toast({ title: isEditing ? "Entry updated" : "Check-in complete", description: `Rug ${data.rugNumber} ${label}.` });

    if (onCheckInComplete) {
      const serviceSnapshots = data.selectedServices
        .map((id) => {
          const svc = serviceById.get(id);
          if (!svc) return null;
          const lt = getLineTotal(svc);
          const up = svc.unit === "flat" ? lt : getUnitPrice(svc);
          const edges = svc.unit === "per linear ft" ? (edgeSelections[id] ?? []) : [];
          return { service_id: id, service_name: svc.name, unit_price: up, line_total: lt, edges };
        })
        .filter(Boolean) as { service_id: string; service_name: string; unit_price: number; line_total: number; edges: string[] }[];

      onCheckInComplete({
        rugId: selectedRug?.id,
        rugNumber: data.rugNumber,
        clientName: data.clientName,
        rugType: data.rugType,
        length: data.length,
        width: data.width,
        selectedServices: data.selectedServices,
        serviceSnapshots,
        totalPrice,
        conditionNotes: data.conditionNotes?.trim() ?? "",
        photos: photos.map((photo) => photo.file),
      });
    }

    form.reset();
    setPhotos([]);
  };

  const isFromPanel = !!selectedRug;
  const isEditing = !!editingEntry;
  const isReadOnlyIdentity = isFromPanel || isEditing;
  const tierLabel = clientTier !== "standard" ? clientTier.charAt(0).toUpperCase() + clientTier.slice(1) : null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
        {/* Sticky header */}
        <div className={`sticky top-0 z-10 px-3 md:px-4 py-2.5 md:py-3 rounded-t-lg flex items-center justify-between ${
          isEditing ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
        }`}>
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <span className="text-base md:text-lg font-bold font-mono truncate">
              {form.watch("rugNumber") || "—"}
            </span>
            <span className="text-xs md:text-sm opacity-80 truncate hidden sm:inline">
              {form.watch("clientName") || "No client"}
            </span>
            {tierLabel && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded shrink-0">{tierLabel}</span>
            )}
            {isEditing && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded shrink-0">Editing</span>
            )}
          </div>
          <span className="text-base md:text-lg font-bold shrink-0">${totalPrice.toFixed(2)}</span>
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

          {/* Identity row */}
          {isReadOnlyIdentity ? (
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Rug #</Label>
                <p className="font-mono font-bold text-base md:text-lg">{form.watch("rugNumber")}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Client</Label>
                <p className="font-medium text-sm md:text-base">{form.watch("clientName")}</p>
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
                      <Input placeholder="Client name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {/* Rug details */}
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

          {/* Condition notes */}
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

          {/* Photo upload */}
          <CheckInPhotoSection
            photos={photos}
            onPhotosChange={setPhotos}
          />

          {/* Service selection */}
          <CheckInServiceSelector
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
            watchedLength={watchedLength}
            watchedWidth={watchedWidth}
            tierLabel={tierLabel}
            error={form.formState.errors.selectedServices?.message}
          />
        </div>

        {/* Footer with line-item summary */}
        <div className="sticky bottom-0 border-t border-border bg-background rounded-b-lg">
          {watchedServices.length > 0 && (
            <div className="px-3 md:px-4 pt-2 pb-1 space-y-0.5 max-h-28 overflow-y-auto">
              {watchedServices.map((id) => {
                const svc = serviceById.get(id);
                if (!svc) return null;
                const lt = getLineTotal(svc);
                return (
                  <div key={id} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate mr-2">{svc.name}</span>
                    <span className="shrink-0 font-medium text-foreground">${lt.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="px-3 md:px-4 py-2.5 md:py-3 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Total: <span className="text-foreground font-bold text-base md:text-lg">${totalPrice.toFixed(2)}</span>
            </div>
            <Button type="submit" size="lg" className="h-10 md:h-11 px-4 md:px-6">
              {isEditing ? "Update" : "Complete Check-In"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
