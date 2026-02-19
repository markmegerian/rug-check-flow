import { useState } from "react";
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
import {
  SERVICES, SERVICE_PRESETS,
  type Service, type ServicePreset,
} from "@/data/services";
import { MOCK_CLIENTS } from "@/data/mock-clients";

// Seed overrides: Pacific Rug Gallery gets discount on Standard Wash
const SEED_OVERRIDES: Record<string, Record<string, number>> = {
  "client-3": {
    "wash-standard": 3.0,
    "wash-deep": 4.25,
  },
};

export function PricingTab() {
  const [services, setServices] = useState<Service[]>([...SERVICES]);
  const [presets, setPresets] = useState<ServicePreset[]>([...SERVICE_PRESETS]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientOverrides, setClientOverrides] = useState<Record<string, Record<string, number>>>(SEED_OVERRIDES);

  // Inline base price editing
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState("");

  // Preset sheet (kept as-is)
  const [presetSheetOpen, setPresetSheetOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ServicePreset | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presetServiceIds, setPresetServiceIds] = useState<string[]>([]);

  // Base price inline edit handlers
  const startEditPrice = (s: Service) => {
    setEditingPriceId(s.id);
    setEditingPriceValue(String(s.basePrice));
  };

  const commitPrice = (serviceId: string) => {
    const price = parseFloat(editingPriceValue);
    if (!isNaN(price) && price >= 0) {
      setServices((prev) =>
        prev.map((s) => (s.id === serviceId ? { ...s, basePrice: price } : s))
      );
    }
    setEditingPriceId(null);
  };

  // Override handlers
  const getOverride = (serviceId: string): string => {
    if (!selectedClientId) return "";
    const val = clientOverrides[selectedClientId]?.[serviceId];
    return val !== undefined ? String(val) : "";
  };

  const setOverride = (serviceId: string, raw: string) => {
    if (!selectedClientId) return;
    setClientOverrides((prev) => {
      const next = { ...prev };
      if (!raw.trim()) {
        // Remove override
        if (next[selectedClientId]) {
          const { [serviceId]: _, ...rest } = next[selectedClientId];
          if (Object.keys(rest).length === 0) {
            delete next[selectedClientId];
          } else {
            next[selectedClientId] = rest;
          }
        }
      } else {
        const price = parseFloat(raw);
        if (!isNaN(price) && price >= 0) {
          next[selectedClientId] = { ...next[selectedClientId], [serviceId]: price };
        }
      }
      return next;
    });
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

  return (
    <div className="p-4 md:p-6 space-y-8 overflow-auto h-full">
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
                {MOCK_CLIENTS.map((c) => (
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
              <TableHead className="w-28">Category</TableHead>
              <TableHead className="w-32">Base Price</TableHead>
              <TableHead className="w-24">Unit</TableHead>
              {selectedClientId && <TableHead className="w-32">Override</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {services.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{s.category}</Badge>
                </TableCell>
                <TableCell>
                  {editingPriceId === s.id ? (
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
                  ) : (
                    <button
                      className="text-left hover:underline cursor-pointer"
                      onClick={() => startEditPrice(s)}
                    >
                      ${s.basePrice.toFixed(2)}
                    </button>
                  )}
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {s.unit === "sqft" ? "/ sq ft" : "flat"}
                  </span>
                </TableCell>
                {selectedClientId && (
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-8 w-24"
                      placeholder="—"
                      value={getOverride(s.id)}
                      onChange={(e) => setOverride(s.id, e.target.value)}
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}
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
              className="border border-border rounded-lg p-3 flex items-start justify-between bg-card"
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
                    <span className="text-muted-foreground ml-auto text-xs">{s.category}</span>
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
