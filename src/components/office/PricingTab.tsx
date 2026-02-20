import { useState, useEffect, useCallback } from "react";
import { X, Package, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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

  const fetchServices = useCallback(async () => {
    const { data, error } = await supabase
      .from("services")
      .select("*")
      .eq("active", true)
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

  // Determine which price column to show based on selected client tier
  const priceColumn: "base_price" | "preferred_price" | "vip_price" = selectedClient
    ? selectedClient.pricing_tier === "vip"
      ? "vip_price"
      : selectedClient.pricing_tier === "preferred"
        ? "preferred_price"
        : "base_price"
    : "base_price";

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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Services</h2>
          <div className="flex items-center gap-2">
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((s) => {
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
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{renderPrice("base_price")}</TableCell>
                  <TableCell>{renderPrice("preferred_price")}</TableCell>
                  <TableCell>{renderPrice("vip_price")}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {s.unit === "per sqft" ? "/ sq ft" : "flat"}
                    </span>
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
                {services.map((s) => (
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
    </div>
  );
}
