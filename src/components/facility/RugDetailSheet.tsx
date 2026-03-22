import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useRug, useInvalidateRugs } from "@/hooks/useRugs";
import { RugContextPanel } from "@/components/shared/RugContextPanel";
import { PRODUCTION_STAGES } from "@/data/production";
import { RUG_TYPES } from "@/data/services";
import { supabase } from "@/integrations/supabase/client";
import { advanceRugStage, createDraftInvoice } from "@/lib/rug-operations";
import { toast } from "@/hooks/use-toast";
import { Check, FileText, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";

interface RugDetailSheetProps {
  rugId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_COLORS: Record<string, string> = {
  checked_in: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_production: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  ready: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  picked_up: "bg-muted text-muted-foreground",
};

type RugServiceRow = {
  id: string;
  rug_id: string;
  service_id: string | null;
  service_name: string;
  unit_price: number;
  line_total: number;
  edges: string[];
};

type AvailableService = {
  id: string;
  name: string;
  unit: string;
  base_price: number;
};

type EditableFields = {
  description: string;
  size_length: string;
  size_width: string;
  notes: string;
};

export function RugDetailSheet({ rugId, open, onOpenChange }: RugDetailSheetProps) {
  const { data: rug, isLoading } = useRug(open ? rugId : null);
  const invalidateRugs = useInvalidateRugs();

  // Editable fields
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<EditableFields>({ description: "", size_length: "", size_width: "", notes: "" });
  const [saving, setSaving] = useState(false);

  // Services
  const [services, setServices] = useState<RugServiceRow[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [availableServices, setAvailableServices] = useState<AvailableService[]>([]);
  const [addingServiceId, setAddingServiceId] = useState<string>("none");
  const [addingService, setAddingService] = useState(false);

  // Load rug data into editable fields
  useEffect(() => {
    if (rug) {
      setFields({
        description: rug.description ?? "",
        size_length: rug.size_length != null ? String(rug.size_length) : "",
        size_width: rug.size_width != null ? String(rug.size_width) : "",
        notes: rug.notes ?? "",
      });
      setEditing(false);
    }
  }, [rug]);

  // Fetch rug_services rows
  const fetchServices = useCallback(async () => {
    if (!rugId) return;
    setServicesLoading(true);
    const { data } = await supabase
      .from("rug_services")
      .select("id, rug_id, service_id, service_name, unit_price, line_total, edges")
      .eq("rug_id", rugId)
      .order("created_at", { ascending: true });
    setServices((data ?? []) as RugServiceRow[]);
    setServicesLoading(false);
  }, [rugId]);

  useEffect(() => {
    if (open && rugId) {
      fetchServices();
    }
  }, [open, rugId, fetchServices]);

  // Fetch available services catalog for adding
  useEffect(() => {
    if (!open) return;
    supabase
      .from("services")
      .select("id, name, unit, base_price")
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        setAvailableServices((data ?? []) as AvailableService[]);
      });
  }, [open]);

  const handleSaveFields = async () => {
    if (!rugId) return;
    setSaving(true);
    const updates: Record<string, unknown> = {
      description: fields.description,
      notes: fields.notes,
    };
    const len = parseFloat(fields.size_length);
    const wid = parseFloat(fields.size_width);
    if (!isNaN(len) && len > 0) updates.size_length = len;
    if (!isNaN(wid) && wid > 0) updates.size_width = wid;

    const { error } = await supabase.from("rugs").update(updates).eq("id", rugId);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Rug updated" });
      invalidateRugs();
      setEditing(false);
    }
    setSaving(false);
  };

  const handleAdvanceStage = async () => {
    if (!rug) return;
    const result = await advanceRugStage(rug.id, rug.status);
    if (!result) return;
    if (result.error) {
      toast({ title: "Update failed", description: result.error, variant: "destructive" });
      return;
    }
    invalidateRugs();
    const label = PRODUCTION_STAGES.find((s) => s.id === result.nextStage)?.label ?? result.nextStage;
    toast({ title: `Advanced to ${label}` });
  };

  const handleAddService = async () => {
    if (!rugId || addingServiceId === "none") return;
    const svc = availableServices.find((s) => s.id === addingServiceId);
    if (!svc) return;

    setAddingService(true);
    const l = parseFloat(fields.size_length) || 0;
    const w = parseFloat(fields.size_width) || 0;
    let lineTotal = Number(svc.base_price);
    if (svc.unit === "per sqft") lineTotal = Number(svc.base_price) * l * w;

    const { error } = await supabase.from("rug_services").insert({
      rug_id: rugId,
      service_id: svc.id,
      service_name: svc.name,
      unit_price: Number(svc.base_price),
      line_total: lineTotal,
      edges: [],
    });

    if (error) {
      toast({ title: "Failed to add service", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${svc.name} added` });
      setAddingServiceId("none");
      await fetchServices();
      invalidateRugs();
    }
    setAddingService(false);
  };

  const handleRemoveService = async (serviceRowId: string) => {
    const { error } = await supabase.from("rug_services").delete().eq("id", serviceRowId);
    if (error) {
      toast({ title: "Failed to remove service", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Service removed" });
      setServices((prev) => prev.filter((s) => s.id !== serviceRowId));
      invalidateRugs();
    }
  };

  const [creatingInvoice, setCreatingInvoice] = useState(false);

  const handleGenerateInvoice = async () => {
    if (!rug || services.length === 0) return;
    setCreatingInvoice(true);

    const result = await createDraftInvoice({
      clientId: rug.client_id!,
      rugId: rug.id,
      rugTag: rug.tag,
      services: services.map((s) => ({ service_name: s.service_name, line_total: Number(s.line_total) })),
    });

    if (result.error) {
      toast({ title: "Invoice creation failed", description: result.error, variant: "destructive" });
    } else {
      toast({ title: `Draft invoice ${result.invoiceNumber} created`, description: `$${result.total.toFixed(2)} from ${services.length} service(s)` });
    }
    setCreatingInvoice(false);
  };

  const stageIndex = rug ? PRODUCTION_STAGES.findIndex((s) => s.id === rug.status) : -1;
  const isLastStage = stageIndex === PRODUCTION_STAGES.length - 1;
  const stageLabel = PRODUCTION_STAGES.find((s) => s.id === rug?.status)?.label ?? rug?.status;

  const timeline = rug
    ? [
        { label: "Checked In", date: rug.checked_in_at },
        { label: "Completed", date: rug.completed_at },
        { label: "Picked Up", date: rug.picked_up_at },
      ]
    : [];

  const servicesTotal = services.reduce((sum, s) => sum + Number(s.line_total), 0);

  // Filter out services already added to this rug
  const addableServices = availableServices.filter(
    (as) => !services.some((s) => s.service_id === as.id)
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {rug ? (
              <>
                <span className="font-mono">{rug.tag}</span>
                <Badge className={STATUS_COLORS[rug.status] ?? ""}>
                  {stageLabel}
                </Badge>
              </>
            ) : (
              "Rug Detail"
            )}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !rug ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Rug not found.</p>
        ) : (
          <div className="space-y-5 pt-4">
            {/* Client */}
            {rug.client_name && (
              <p className="text-sm text-muted-foreground">{rug.client_name}</p>
            )}

            {/* Photo */}
            {rug.photo_url && (
              <img
                src={rug.photo_url}
                alt={`Rug ${rug.tag}`}
                className="w-full rounded-lg border object-cover max-h-48"
              />
            )}

            {/* Editable Details */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Details</h4>
                {!editing ? (
                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => setEditing(true)}>
                    <Pencil className="h-3 w-3" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => {
                      setFields({
                        description: rug.description ?? "",
                        size_length: rug.size_length != null ? String(rug.size_length) : "",
                        size_width: rug.size_width != null ? String(rug.size_width) : "",
                        notes: rug.notes ?? "",
                      });
                      setEditing(false);
                    }}>
                      <X className="h-3 w-3" />
                    </Button>
                    <Button size="sm" className="h-6 text-xs gap-1" onClick={handleSaveFields} disabled={saving}>
                      <Save className="h-3 w-3" /> {saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
              </div>

              {editing ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Rug Type</Label>
                    <Select value={fields.description} onValueChange={(v) => setFields((f) => ({ ...f, description: v }))}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {RUG_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Length (ft)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        className="h-8 text-sm"
                        value={fields.size_length}
                        onChange={(e) => setFields((f) => ({ ...f, size_length: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Width (ft)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        className="h-8 text-sm"
                        value={fields.size_width}
                        onChange={(e) => setFields((f) => ({ ...f, size_width: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Size</p>
                    <p>{rug.size_length ?? "?"}×{rug.size_width ?? "?"} ft</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Type</p>
                    <p>{rug.description || "—"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Check-in Date</p>
                    <p>{new Date(rug.checked_in_at).toLocaleDateString()}</p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Services — editable */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Services {services.length > 0 && <span className="normal-case">· ${servicesTotal.toFixed(2)}</span>}
                </h4>
              </div>

              {servicesLoading ? (
                <p className="text-xs text-muted-foreground">Loading services...</p>
              ) : services.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No services assigned.</p>
              ) : (
                <div className="space-y-1.5">
                  {services.map((s) => {
                    const edgeLabel = s.edges && s.edges.length > 0 && s.edges.length < 4
                      ? ` (${s.edges.map(e => e === "end1" ? "E1" : e === "end2" ? "E2" : e === "side1" ? "S1" : "S2").join("+")})`
                      : "";
                    return (
                      <div key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm group">
                        <span>{s.service_name}{edgeLabel}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">${Number(s.line_total).toFixed(2)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                            onClick={() => handleRemoveService(s.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add service */}
              {addableServices.length > 0 && (
                <div className="flex gap-2 pt-1">
                  <Select value={addingServiceId} onValueChange={setAddingServiceId}>
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Add service..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select service...</SelectItem>
                      {addableServices.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} — ${Number(s.base_price).toFixed(2)}/{s.unit === "per sqft" ? "sf" : s.unit === "per linear ft" ? "lf" : "flat"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={addingServiceId === "none" || addingService}
                    onClick={handleAddService}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Timeline */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h4>
              <div className="space-y-2">
                {timeline.map((step, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${step.date ? "bg-primary" : "bg-muted-foreground/30"}`} />
                    <span className={step.date ? "text-foreground" : "text-muted-foreground/50"}>
                      {step.label}
                    </span>
                    {step.date && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(step.date).toLocaleString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Delivery & Invoice Context */}
            <RugContextPanel rugId={rug.id} showDeliveryProofs />

            <Separator />

            {/* Notes */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</h4>
              {editing ? (
                <Textarea
                  value={fields.notes}
                  onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Add notes about this rug..."
                  rows={3}
                />
              ) : (
                <>
                  <Textarea
                    value={fields.notes}
                    onChange={(e) => {
                      setFields((f) => ({ ...f, notes: e.target.value }));
                      setEditing(true);
                    }}
                    placeholder="Add notes about this rug..."
                    rows={3}
                  />
                </>
              )}
            </div>

            <Separator />

            {/* Actions */}
            <div className="space-y-2">
              {!isLastStage && stageIndex >= 0 && (
                <Button onClick={handleAdvanceStage} className="w-full">
                  Advance to {PRODUCTION_STAGES[stageIndex + 1]?.label}
                </Button>
              )}
              {rug.client_id && services.length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleGenerateInvoice}
                  disabled={creatingInvoice}
                  className="w-full gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {creatingInvoice ? "Creating..." : `Generate Invoice · $${servicesTotal.toFixed(2)}`}
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
