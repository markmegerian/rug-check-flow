import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronDown, Search, X } from "lucide-react";
import RugEdgeDiagram from "./RugEdgeDiagram";
import { calcSelectedLinearFt, type RugEdge } from "@/lib/rug-edges";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

interface DbService {
  id: string;
  name: string;
  unit: string;
  base_price: number;
  preferred_price: number;
  vip_price: number;
  category: string;
}

type PricingTier = "standard" | "preferred" | "vip";

const ACCEPTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

const isSupportedImageFile = (file: File) => {
  if (ACCEPTED_IMAGE_MIME_TYPES.has(file.type.toLowerCase())) return true;
  const name = file.name.toLowerCase();
  return ACCEPTED_IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
};

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

function ServiceCategoryGroup({
  category, services, isFirst, watchedServices, getUnitPrice, getLineTotal,
  toggleService, edgeSelections, setEdgeSelections, flatPrices, setFlatPrices,
  watchedLength, watchedWidth,
}: {
  category: string;
  services: DbService[];
  isFirst: boolean;
  watchedServices: string[];
  getUnitPrice: (svc: DbService) => number;
  getLineTotal: (svc: DbService) => number;
  toggleService: (id: string) => void;
  edgeSelections: Record<string, RugEdge[]>;
  setEdgeSelections: React.Dispatch<React.SetStateAction<Record<string, RugEdge[]>>>;
  flatPrices: Record<string, string>;
  setFlatPrices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  watchedLength: number;
  watchedWidth: number;
}) {
  const [open, setOpen] = useState(true);
  const selectedCount = services.filter((s) => watchedServices.includes(s.id)).length;

  return (
    <div className={!isFirst ? "border-t border-border" : ""}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {category}
          {selectedCount > 0 && (
            <span className="ml-1.5 text-foreground normal-case tracking-normal font-bold">
              ({selectedCount})
            </span>
          )}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && (
        <div className="divide-y divide-border/50">
          {services.map((svc) => {
            const unitPrice = getUnitPrice(svc);
            const lineTotal = getLineTotal(svc);
            const checked = watchedServices.includes(svc.id);
            const isFlat = svc.unit === "flat";
            const isLinear = svc.unit === "per linear ft";
            const edges = edgeSelections[svc.id] ?? [];
            const l = Number(watchedLength) || 0;
            const w = Number(watchedWidth) || 0;

            const toggleEdge = (edge: RugEdge) => {
              setEdgeSelections((prev) => {
                const current = prev[svc.id] ?? [];
                return {
                  ...prev,
                  [svc.id]: current.includes(edge)
                    ? current.filter((e) => e !== edge)
                    : [...current, edge],
                };
              });
            };

            return (
              <div key={svc.id} className="px-1">
                <label
                  className={`flex items-center gap-2 md:gap-3 px-2 md:px-3 py-2.5 md:py-2 rounded-md cursor-pointer transition-colors ${
                    checked ? "bg-accent" : "hover:bg-muted"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleService(svc.id)}
                  />
                  <span className="flex-1 text-sm truncate">{svc.name}</span>
                  {!isFlat && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      ${unitPrice.toFixed(2)}/{isLinear ? "lf" : "sf"}
                    </span>
                  )}
                  {isFlat && !checked && (
                    <span className="text-xs text-muted-foreground shrink-0">Flat rate</span>
                  )}
                  {checked && !isFlat && !isLinear && (
                    <span className="text-sm font-semibold shrink-0">
                      ${lineTotal.toFixed(2)}
                    </span>
                  )}
                  {checked && isLinear && edges.length > 0 && (
                    <span className="text-sm font-semibold shrink-0">
                      ${lineTotal.toFixed(2)}
                    </span>
                  )}
                </label>
                {checked && isLinear && l > 0 && w > 0 && (
                  <div className="ml-4 md:ml-8 mt-2 mb-2">
                    <RugEdgeDiagram
                      lengthFt={l}
                      widthFt={w}
                      selectedEdges={edges}
                      onToggleEdge={toggleEdge}
                    />
                    {edges.length > 0 && (
                      <p className="text-xs text-muted-foreground text-center mt-1">
                        {calcSelectedLinearFt(edges, l, w).toFixed(1)} lin ft selected
                      </p>
                    )}
                  </div>
                )}
                {checked && isFlat && (
                  <div className="flex items-center gap-2 ml-8 mt-1 mb-1">
                    <span className="text-xs text-muted-foreground">Price $</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      placeholder="Enter price"
                      className="h-8 w-28"
                      value={flatPrices[svc.id] ?? ""}
                      onChange={(e) => setFlatPrices((prev) => ({ ...prev, [svc.id]: e.target.value }))}
                    />
                    {lineTotal > 0 && (
                      <span className="text-sm font-semibold">${lineTotal.toFixed(2)}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function CheckInForm({ selectedRug, editingEntry, onCheckInComplete }: CheckInFormProps) {
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dbServices, setDbServices] = useState<DbService[]>([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [clientTier, setClientTier] = useState<PricingTier>("standard");
  const [flatPrices, setFlatPrices] = useState<Record<string, string>>({});
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  // Per-service edge selections for linear-ft services
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

  const totalPrice = useMemo(() => {
    return watchedServices.reduce((sum, id) => {
      const svc = dbServices.find((s) => s.id === id);
      return svc ? sum + getLineTotal(svc) : sum;
    }, 0);
  }, [watchedServices, dbServices, getLineTotal]);

  const appendFilesAsPhotos = useCallback((files: File[]) => {
    const invalidFiles = files.filter((file) => !isSupportedImageFile(file));
    if (invalidFiles.length > 0) {
      toast({
        title: "Unsupported file type",
        description: "Only JPG, PNG, and WEBP photos are supported. HEIC and video files are not allowed.",
        variant: "destructive",
      });
    }

    const validFiles = files.filter((file) => isSupportedImageFile(file));
    const remaining = 20 - photos.length;
    const toAdd = validFiles.slice(0, remaining);
    const newPhotos = toAdd.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    if (validFiles.length > remaining) {
      toast({
        title: "Photo limit reached",
        description: "You can upload up to 20 photos per check-in.",
        variant: "destructive",
      });
    }

    if (newPhotos.length > 0) {
      setPhotos((prev) => [...prev, ...newPhotos]);
    }
  }, [photos.length]);

  const stopCameraStream = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const openCameraCapture = useCallback(async () => {
    if (!window.isSecureContext) {
      toast({
        title: "Secure context required",
        description: "Camera capture needs HTTPS (or localhost). Use Upload Photo if you are on an insecure URL.",
        variant: "destructive",
      });
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraSupported(false);
      toast({
        title: "Camera not supported",
        description: "This device/browser does not support direct camera capture. Use Upload instead.",
        variant: "destructive",
      });
      return;
    }

    setCameraLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 0);
    } catch (error) {
      toast({
        title: "Unable to open camera",
        description: error instanceof Error ? error.message : "Camera permission was denied.",
        variant: "destructive",
      });
    } finally {
      setCameraLoading(false);
    }
  }, []);

  const captureFromCamera = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      toast({ title: "Camera not ready", description: "Wait for camera preview, then try again.", variant: "destructive" });
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      toast({ title: "Capture failed", description: "Could not access camera frame.", variant: "destructive" });
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) {
        toast({ title: "Capture failed", description: "Could not create captured image.", variant: "destructive" });
        return;
      }
      const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      appendFilesAsPhotos([file]);
      setCameraOpen(false);
      stopCameraStream();
    }, "image/jpeg", 0.92);
  }, [appendFilesAsPhotos, stopCameraStream]);

  useEffect(() => {
    return () => stopCameraStream();
  }, [stopCameraStream]);

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    appendFilesAsPhotos(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

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
          const svc = dbServices.find((s) => s.id === id);
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

          {/* Rug details — stack on mobile */}
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
                  className="relative w-16 h-16 md:w-20 md:h-20 rounded-md overflow-hidden border border-border group"
                >
                  <img
                    src={photo.preview}
                    alt={`Photo ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-1 md:p-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3.5 w-3.5 md:h-3 md:w-3" />
                  </button>
                </div>
              ))}
              {photos.length < 20 && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 md:w-20 md:h-20 rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    title="Upload photo"
                  >
                    <Camera className="h-5 w-5" />
                  </button>
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void openCameraCapture()} disabled={cameraLoading || !cameraSupported}>
                    {cameraLoading ? "Opening camera…" : "Use Camera"}
                  </Button>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              capture="environment"
              multiple
              className="hidden"
              onChange={handlePhotos}
            />
            <Dialog open={cameraOpen} onOpenChange={(open) => { setCameraOpen(open); if (!open) stopCameraStream(); }}>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Capture check-in photo</DialogTitle>
                  <DialogDescription>Use attached webcam or mobile camera to capture a photo now.</DialogDescription>
                </DialogHeader>
                <div className="rounded-md border bg-black/80 overflow-hidden">
                  <video ref={videoRef} className="w-full h-auto" playsInline muted />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => { setCameraOpen(false); stopCameraStream(); }}>Cancel</Button>
                  <Button type="button" onClick={captureFromCamera}>Capture Photo</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Service selection */}
          <div className="space-y-2 md:space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-sm md:text-base">Services</Label>
                {watchedServices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      form.setValue("selectedServices", [], { shouldValidate: true });
                      setFlatPrices({});
                      setEdgeSelections({});
                    }}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
              {tierLabel && (
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-accent text-accent-foreground">
                  {tierLabel} pricing
                </span>
              )}
            </div>

            {/* Preset quick-select chips */}
            {dbServices.length > 0 && (() => {
              const PRESETS = [
                { label: "Basic Clean", names: ["Standard Wash"] },
                { label: "Full Service", names: ["Deep Wash", "Scotchgard"] },
                { label: "Pet Owner", names: ["Pet Stain Treatment", "Odor Removal", "Scotchgard"] },
              ];
              return (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {PRESETS.map((preset) => {
                    const ids = preset.names
                      .map((n) => dbServices.find((s) => s.name.toLowerCase() === n.toLowerCase())?.id)
                      .filter(Boolean) as string[];
                    if (ids.length === 0) return null;
                    const allSelected = ids.length > 0 && ids.every((id) => watchedServices.includes(id));
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          if (allSelected) {
                            const next = watchedServices.filter((id) => !ids.includes(id));
                            form.setValue("selectedServices", next, { shouldValidate: true });
                          } else {
                            const merged = Array.from(new Set([...watchedServices, ...ids]));
                            form.setValue("selectedServices", merged, { shouldValidate: true });
                          }
                        }}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          allSelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 text-muted-foreground border-border hover:border-primary hover:text-foreground"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {dbServices.length > 0 && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search services…"
                  className="h-8 pl-8 text-sm"
                  value={serviceSearch}
                  onChange={(e) => setServiceSearch(e.target.value)}
                />
              </div>
            )}

            {dbServices.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Loading services…</p>
            )}

            <div className="max-h-[40vh] overflow-y-auto border border-border rounded-md">
              {(() => {
                const CATEGORY_ORDER = ["Cleaning", "Repair", "Protection", "Specialty"];
                const searchLower = serviceSearch.toLowerCase();
                const filteredServices = searchLower
                  ? dbServices.filter((svc) => svc.name.toLowerCase().includes(searchLower))
                  : dbServices;
                const grouped: Record<string, DbService[]> = {};
                filteredServices.forEach((svc) => {
                  const cat = svc.category || "Other";
                  if (!grouped[cat]) grouped[cat] = [];
                  grouped[cat].push(svc);
                });
                const categories = CATEGORY_ORDER.filter((c) => grouped[c]?.length).concat(
                  Object.keys(grouped).filter((c) => !CATEGORY_ORDER.includes(c))
                );

                return categories.map((cat, catIdx) => (
                  <ServiceCategoryGroup
                    key={cat}
                    category={cat}
                    services={grouped[cat]}
                    isFirst={catIdx === 0}
                    watchedServices={watchedServices}
                    getUnitPrice={getUnitPrice}
                    getLineTotal={getLineTotal}
                    toggleService={toggleService}
                    edgeSelections={edgeSelections}
                    setEdgeSelections={setEdgeSelections}
                    flatPrices={flatPrices}
                    setFlatPrices={setFlatPrices}
                    watchedLength={watchedLength}
                    watchedWidth={watchedWidth}
                  />
                ));
              })()}
            </div>

            {form.formState.errors.selectedServices && (
              <p className="text-sm text-destructive">
                {form.formState.errors.selectedServices.message}
              </p>
            )}
          </div>
        </div>

        {/* Footer with line-item summary */}
        <div className="sticky bottom-0 border-t border-border bg-background rounded-b-lg">
          {watchedServices.length > 0 && (
            <div className="px-3 md:px-4 pt-2 pb-1 space-y-0.5 max-h-28 overflow-y-auto">
              {watchedServices.map((id) => {
                const svc = dbServices.find((s) => s.id === id);
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
