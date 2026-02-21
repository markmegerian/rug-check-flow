import { useState, useEffect, useCallback } from "react";
import { X, Package, Pencil, Plus, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type DbService = Tables<"services">;
type DbClient = Tables<"clients">;

interface ServicePreset {
  id: string;
  name: string;
  serviceIds: string[];
}

export function PricingTab() {
  const { toast } = useToast();
  const [services, setServices] = useState<DbService[]>([]);
  const [clients, setClients] = useState<DbClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHidden, setShowHidden] = useState(false);

  // Local presets (not yet persisted to DB)
  const [presets, setPresets] = useState<ServicePreset[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Inline editing
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");
  const [editingColumn, setEditingColumn] = useState<"base_price" | "preferred_price" | "vip_price">("base_price");

  // Preset sheet
  const [presetSheetOpen, setPresetSheetOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ServicePreset | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presetServiceIds, setPresetServiceIds] = useState<string[]>([]);

  // Add service sheet
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceUnit, setNewServiceUnit] = useState("per sqft");
  const [newServiceBasePrice, setNewServiceBasePrice] = useState("");
  const [newServicePreferredPrice, setNewServicePreferredPrice] = useState("");
  const [newServiceVipPrice, setNewServiceVipPrice] = useState("");
  const [savingService, setSavingService] = useState(false);

  const fetchServices = useCallback(async () => {
    // Fetch ALL services so we can show/hide them
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .order("name");
    if (error) {
      toast({ title: "Failed to load services", description: error.message, variant: "destructive" });
    } else {
      setServices(data ?? []);
    }
    setLoading(false);
  }, [toast]);

  const fetchClients = useCallback(async () => {
    const { data } = await supabase.from("clients").select("*").order("name");
    setClients(data ?? []);
  }, []);

  useEffect(() => {
    fetchServices();
    fetchClients();
  }, [fetchServices, fetchClients]);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const priceColumn: "base_price" | "preferred_price" | "vip_price" = selectedClient
    ? selectedClient.pricing_tier === "vip"
      ? "vip_price"
      : selectedClient.pricing_tier === "preferred"
        ? "preferred_price"
        : "base_price"
    : "base_price";

  const visibleServices = showHidden ? services : services.filter((s) => s.active);

  const startEditPrice = (s: DbService, col: "base_price" | "preferred_price" | "vip_price") => {
    setEditingPriceId(s.id);
    setEditingColumn(col);
    setEditingPriceValue(String(s[col]));
  };

  const commitPrice = async (serviceId: string) => {
    const price = parseFloat(editingPriceValue);
    if (!isNaN(price) && price >= 0) {
      const { error } = await supabase
        .from("services")
        .update({ [editingColumn]: price })
        .eq("id", serviceId);
      if (error) {
        toast({ title: "Update failed", description: error.message, variant: "destructive" });
      } else {
        setServices((prev) =>
          prev.map((s) => (s.id === serviceId ? { ...s, [editingColumn]: price } : s))
        );
      }
    }
    setEditingPriceId(null);
  };

  const toggleServiceActive = async (service: DbService) => {
    const newActive = !service.active;
    const { error } = await supabase
      .from("services")
      .update({ active: newActive })
      .eq("id", service.id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, active: newActive } : s))
      );
      toast({ title: newActive ? "Service shown" : "Service hidden" });
    }
  };

  const saveNewService = async () => {
    if (!newServiceName.trim()) return;
    setSavingService(true);
    const base = parseFloat(newServiceBasePrice) || 0;
    const preferred = parseFloat(newServicePreferredPrice) || base;
    const vip = parseFloat(newServiceVipPrice) || base;
    const { data, error } = await supabase
      .from("services")
      .insert({
        name: newServiceName.trim(),
        unit: newServiceUnit,
        base_price: base,
        preferred_price: preferred,
        vip_price: vip,
      })
      .select()
      .single();
    setSavingService(false);
    if (error) {
      toast({ title: "Failed to add service", description: error.message, variant: "destructive" });
    } else if (data) {
      setServices((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setAddServiceOpen(false);
      setNewServiceName("");
      setNewServiceBasePrice("");
      setNewServicePreferredPrice("");
      setNewServiceVipPrice("");
      setNewServiceUnit("per sqft");
      toast({ title: "Service added" });
    }
  };

  // Preset handlers
  const openAddPreset = () => {
    setEditingPreset(null);
    setPresetName("");
    setPresetServiceIds([]);
    setPresetSheetOpen(true);
  };

  const openEditPreset = (p: ServicePreset) => {
    setEditingPreset(p);
    setPresetName(p.name);
    setPresetServiceIds([...p.serviceIds]);
    setPresetSheetOpen(true);
  };

  const savePreset = () => {
    if (!presetName.trim() || presetServiceIds.length === 0) return;
    if (editingPreset) {
      setPresets((prev) =>
        prev.map((p) =>
          p.id === editingPreset.id
            ? { ...p, name: presetName.trim(), serviceIds: presetServiceIds }
            : p
        )
      );
    } else {
      setPresets((prev) => [
        ...prev,
        { id: `preset-${Date.now()}`, name: presetName.trim(), serviceIds: presetServiceIds },
      ]);
    }
    setPresetSheetOpen(false);
  };

  const togglePresetService = (id: string) => {
    setPresetServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading services…</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-8 overflow-auto h-full animate-fade-in-up">
      {/* Services Table */}
      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-foreground">Services</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <Switch checked={showHidden} onCheckedChange={setShowHidden} />
              Show hidden
            </label>
            <Button size="sm" variant="outline" onClick={() => setAddServiceOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Service
            </Button>
            {selectedClientId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedClientId(null)}
                className="text-muted-foreground"
              >
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}
            <Select
              value={selectedClientId ?? "none"}
              onValueChange={(v) => setSelectedClientId(v === "none" ? null : v)}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Client: None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Client</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead className="w-32">Base Price</TableHead>
              <TableHead className="w-32">Preferred</TableHead>
              <TableHead className="w-32">VIP</TableHead>
              <TableHead className="w-24">Unit</TableHead>
              <TableHead className="w-16 text-center">Visible</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleServices.map((s) => {
              const renderPrice = (col: "base_price" | "preferred_price" | "vip_price") => {
                const isEditing = editingPriceId === s.id && editingColumn === col;
                const isHighlighted = selectedClient && priceColumn === col;
                if (isEditing) {
                  return (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-8 w-24"
                      value={editingPriceValue}
                      onChange={(e) => setEditingPriceValue(e.target.value)}
                      onBlur={() => commitPrice(s.id)}
                      onKeyDown={(e) => e.key === "Enter" && commitPrice(s.id)}
                      autoFocus
                    />
                  );
                }
                return (
                  <button
                    className={`text-left hover:underline cursor-pointer ${isHighlighted ? "font-bold text-primary" : ""}`}
                    onClick={() => startEditPrice(s, col)}
                  >
                    ${Number(s[col]).toFixed(2)}
                  </button>
                );
              };

              return (
                <TableRow key={s.id} className={!s.active ? "opacity-50" : ""}>
                  <TableCell className="font-medium">
                    {s.name}
                    {!s.active && <Badge variant="outline" className="ml-2 text-xs">Hidden</Badge>}
                  </TableCell>
                  <TableCell>{renderPrice("base_price")}</TableCell>
                  <TableCell>{renderPrice("preferred_price")}</TableCell>
                  <TableCell>{renderPrice("vip_price")}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {s.unit === "per sqft" ? "/ sq ft" : s.unit === "per linear ft" ? "/ lin ft" : "flat"}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleServiceActive(s)}
                      title={s.active ? "Hide service" : "Show service"}
                    >
                      {s.active ? <Eye className="h-4 w-4 text-muted-foreground" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      {/* Presets */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Service Presets</h2>
          <Button size="sm" variant="outline" onClick={openAddPreset}>
            <Package className="h-4 w-4 mr-1" /> Add Preset
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((p) => (
            <div
              key={p.id}
              className="border border-border rounded-lg p-3 flex items-start justify-between bg-card shadow-card"
            >
              <div>
                <p className="font-medium text-sm text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {p.serviceIds
                    .map((sid) => services.find((s) => s.id === sid)?.name)
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => openEditPreset(p)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {presets.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full">No presets yet. Add one above.</p>
          )}
        </div>
      </section>

      {/* Preset Sheet */}
      <Sheet open={presetSheetOpen} onOpenChange={setPresetSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingPreset ? "Edit Preset" : "Add Preset"}</SheetTitle>
            <SheetDescription>
              {editingPreset ? "Update preset services." : "Create a new service preset."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label>Preset Name</Label>
              <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Services</Label>
              <div className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
                {services.filter((s) => s.active).map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 text-sm"
                  >
                    <Checkbox
                      checked={presetServiceIds.includes(s.id)}
                      onCheckedChange={() => togglePresetService(s.id)}
                    />
                    <span className="text-foreground">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button onClick={savePreset} className="w-full">Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Add Service Sheet */}
      <Sheet open={addServiceOpen} onOpenChange={setAddServiceOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Add Service</SheetTitle>
            <SheetDescription>Create a new service for the price list.</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label>Service Name</Label>
              <Input value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} placeholder="e.g. Deep Wash" />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={newServiceUnit} onValueChange={setNewServiceUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per sqft">Per Sq Ft</SelectItem>
                  <SelectItem value="per linear ft">Per Linear Ft</SelectItem>
                  <SelectItem value="flat">Flat Rate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Base Price</Label>
              <Input type="number" step="0.01" min="0" inputMode="decimal" value={newServiceBasePrice} onChange={(e) => setNewServiceBasePrice(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Preferred Price <span className="text-muted-foreground text-xs">(defaults to base)</span></Label>
              <Input type="number" step="0.01" min="0" inputMode="decimal" value={newServicePreferredPrice} onChange={(e) => setNewServicePreferredPrice(e.target.value)} placeholder={newServiceBasePrice || "0.00"} />
            </div>
            <div className="space-y-2">
              <Label>VIP Price <span className="text-muted-foreground text-xs">(defaults to base)</span></Label>
              <Input type="number" step="0.01" min="0" inputMode="decimal" value={newServiceVipPrice} onChange={(e) => setNewServiceVipPrice(e.target.value)} placeholder={newServiceBasePrice || "0.00"} />
            </div>
          </div>
          <SheetFooter>
            <Button onClick={saveNewService} disabled={!newServiceName.trim() || savingService} className="w-full">
              {savingService ? "Saving…" : "Add Service"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
