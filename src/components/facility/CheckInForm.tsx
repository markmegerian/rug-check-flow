import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, X, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  SERVICES,
  SERVICE_CATEGORIES,
  SERVICE_PRESETS,
  RUG_TYPES,
  type Service,
} from "@/data/services";
import { type PendingRug } from "@/data/mock-pending-rugs";

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

// Simulated client overrides — will come from DB later
const CLIENT_OVERRIDES: Record<string, Record<string, number>> = {
  "Acme Corp": { "wash-standard": 2.75, "protect-scotch": 1.5 },
};

interface CheckInFormProps {
  selectedRug?: PendingRug | null;
  onCheckInComplete?: (rugId: string) => void;
}

export function CheckInForm({ selectedRug, onCheckInComplete }: CheckInFormProps) {
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<CheckInValues>({
    resolver: zodResolver(checkInSchema),
    defaultValues: {
      rugNumber: "",
      clientName: "",
      rugType: "",
      length: undefined as unknown as number,
      width: undefined as unknown as number,
      conditionNotes: "",
      selectedServices: [],
    },
  });

  // Pre-fill form when a rug is selected from left panel
  useEffect(() => {
    if (selectedRug) {
      form.reset({
        rugNumber: selectedRug.rugNumber,
        clientName: selectedRug.clientName,
        rugType: selectedRug.rugType ?? "",
        length: selectedRug.length ?? (undefined as unknown as number),
        width: selectedRug.width ?? (undefined as unknown as number),
        conditionNotes: "",
        selectedServices: [],
      });
      setPhotos([]);
    }
  }, [selectedRug, form]);

  const watchedClient = form.watch("clientName");
  const watchedLength = form.watch("length");
  const watchedWidth = form.watch("width");
  const watchedServices = form.watch("selectedServices");

  const sqft = useMemo(() => {
    const l = Number(watchedLength) || 0;
    const w = Number(watchedWidth) || 0;
    return l * w;
  }, [watchedLength, watchedWidth]);

  const overrides = CLIENT_OVERRIDES[watchedClient] ?? {};

  const getPrice = useCallback(
    (service: Service) => {
      const price = overrides[service.id] ?? service.basePrice;
      return service.unit === "sqft" ? price * sqft : price;
    },
    [overrides, sqft]
  );

  const totalPrice = useMemo(() => {
    return watchedServices.reduce((sum, id) => {
      const svc = SERVICES.find((s) => s.id === id);
      return svc ? sum + getPrice(svc) : sum;
    }, 0);
  }, [watchedServices, getPrice]);

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const remaining = 20 - photos.length;
    const toAdd = files.slice(0, remaining);
    const newPhotos = toAdd.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const applyPreset = (presetId: string) => {
    const preset = SERVICE_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      form.setValue("selectedServices", preset.serviceIds, { shouldValidate: true });
    }
  };

  const toggleService = (serviceId: string) => {
    const current = form.getValues("selectedServices");
    const next = current.includes(serviceId)
      ? current.filter((id) => id !== serviceId)
      : [...current, serviceId];
    form.setValue("selectedServices", next, { shouldValidate: true });
  };

  const onSubmit = (data: CheckInValues) => {
    if (photos.length < 1) {
      toast({ title: "Photos required", description: "Upload at least 1 photo.", variant: "destructive" });
      return;
    }
    console.log("Check-in submitted:", { ...data, photos: photos.length, totalPrice });
    toast({ title: "Check-in complete", description: `Rug ${data.rugNumber} checked in.` });

    if (selectedRug && onCheckInComplete) {
      onCheckInComplete(selectedRug.id);
    }

    form.reset();
    setPhotos([]);
  };

  const isFromPanel = !!selectedRug;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col h-full">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-4 py-3 rounded-t-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold font-mono">
              {form.watch("rugNumber") || "—"}
            </span>
            <span className="text-sm opacity-80">
              {form.watch("clientName") || "No client"}
            </span>
          </div>
          <span className="text-lg font-bold">${totalPrice.toFixed(2)}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Identity row — read-only when loaded from panel */}
          {isFromPanel ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Rug #</Label>
                <p className="font-mono font-bold text-lg">{form.watch("rugNumber")}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Client</Label>
                <p className="font-medium">{form.watch("clientName")}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="rugType"
              render={({ field }) => (
                <FormItem>
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
                    <Input type="number" step="0.1" placeholder="0.0" {...field} />
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
                    <Input type="number" step="0.1" placeholder="0.0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {sqft > 0 && (
            <p className="text-sm text-muted-foreground">
              Area: <span className="font-medium text-foreground">{sqft.toFixed(1)} sq ft</span>
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
          <div className="space-y-2">
            <Label>
              Photos{" "}
              <span className="text-muted-foreground font-normal">
                ({photos.length}/20 — min 1)
              </span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {photos.map((photo, i) => (
                <div
                  key={i}
                  className="relative w-20 h-20 rounded-md overflow-hidden border border-border group"
                >
                  <img
                    src={photo.preview}
                    alt={`Photo ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {photos.length < 20 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Camera className="h-5 w-5" />
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePhotos}
            />
          </div>

          {/* Service selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base">Services</Label>
              <Select onValueChange={applyPreset}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="Apply preset…" />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {SERVICE_CATEGORIES.map((category) => {
              const catServices = SERVICES.filter((s) => s.category === category);
              return (
                <div key={category} className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {category}
                  </p>
                  {catServices.map((svc) => {
                    const isOverridden = svc.id in overrides;
                    const price = getPrice(svc);
                    const checked = watchedServices.includes(svc.id);
                    return (
                      <label
                        key={svc.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                          checked
                            ? "bg-accent"
                            : "hover:bg-muted"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleService(svc.id)}
                        />
                        <span className="flex-1 text-sm">{svc.name}</span>
                        {isOverridden && (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        )}
                        <span className="text-sm font-mono text-muted-foreground">
                          {svc.unit === "sqft"
                            ? `$${(overrides[svc.id] ?? svc.basePrice).toFixed(2)}/sqft`
                            : `$${svc.basePrice.toFixed(2)}`}
                        </span>
                        {checked && sqft > 0 && svc.unit === "sqft" && (
                          <span className="text-sm font-medium w-20 text-right">
                            ${price.toFixed(2)}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              );
            })}

            {form.formState.errors.selectedServices && (
              <p className="text-sm text-destructive">
                {form.formState.errors.selectedServices.message}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-border bg-background p-4 flex items-center justify-between rounded-b-lg">
          <div className="text-sm text-muted-foreground">
            Total: <span className="text-foreground font-bold text-lg">${totalPrice.toFixed(2)}</span>
          </div>
          <Button type="submit" size="lg">
            Complete Check-In
          </Button>
        </div>
      </form>
    </Form>
  );
}
