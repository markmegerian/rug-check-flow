import { useState } from "react";
import { Plus, Pencil, Package } from "lucide-react";
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
  SERVICES, SERVICE_PRESETS, SERVICE_CATEGORIES,
  type Service, type ServicePreset,
} from "@/data/services";

export function PricingTab() {
  const [services, setServices] = useState<Service[]>([...SERVICES]);
  const [presets, setPresets] = useState<ServicePreset[]>([...SERVICE_PRESETS]);

  // Service sheet
  const [serviceSheetOpen, setServiceSheetOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [svcName, setSvcName] = useState("");
  const [svcCategory, setSvcCategory] = useState<string>(SERVICE_CATEGORIES[0]);
  const [svcPrice, setSvcPrice] = useState("");
  const [svcUnit, setSvcUnit] = useState<"sqft" | "flat">("sqft");

  // Preset sheet
  const [presetSheetOpen, setPresetSheetOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<ServicePreset | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presetServiceIds, setPresetServiceIds] = useState<string[]>([]);

  const openAddService = () => {
    setEditingService(null);
    setSvcName("");
    setSvcCategory(SERVICE_CATEGORIES[0]);
    setSvcPrice("");
    setSvcUnit("sqft");
    setServiceSheetOpen(true);
  };

  const openEditService = (s: Service) => {
    setEditingService(s);
    setSvcName(s.name);
    setSvcCategory(s.category);
    setSvcPrice(String(s.basePrice));
    setSvcUnit(s.unit);
    setServiceSheetOpen(true);
  };

  const saveService = () => {
    const price = parseFloat(svcPrice);
    if (!svcName.trim() || isNaN(price)) return;
    if (editingService) {
      setServices((prev) =>
        prev.map((s) =>
          s.id === editingService.id
            ? { ...s, name: svcName.trim(), category: svcCategory, basePrice: price, unit: svcUnit }
            : s
        )
      );
    } else {
      const newId = `svc-${Date.now()}`;
      setServices((prev) => [
        ...prev,
        { id: newId, name: svcName.trim(), category: svcCategory, basePrice: price, unit: svcUnit },
      ]);
    }
    setServiceSheetOpen(false);
  };

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

  const grouped = SERVICE_CATEGORIES.map((cat) => ({
    category: cat,
    items: services.filter((s) => s.category === cat),
  }));

  return (
    <div className="p-4 md:p-6 space-y-8 overflow-auto h-full">
      {/* Services */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Services</h2>
          <Button size="sm" onClick={openAddService}>
            <Plus className="h-4 w-4 mr-1" /> Add Service
          </Button>
        </div>

        {grouped.map((group) => (
          <div key={group.category} className="mb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">{group.category}</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead className="w-28">Base Price</TableHead>
                  <TableHead className="w-20">Unit</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>${s.basePrice.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {s.unit === "sqft" ? "/ sq ft" : "flat"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => openEditService(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
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

      {/* Service Sheet */}
      <Sheet open={serviceSheetOpen} onOpenChange={setServiceSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingService ? "Edit Service" : "Add Service"}</SheetTitle>
            <SheetDescription>
              {editingService ? "Update service details." : "Create a new service."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={svcName} onChange={(e) => setSvcName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={svcCategory} onValueChange={setSvcCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Base Price ($)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={svcPrice}
                onChange={(e) => setSvcPrice(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <div className="flex gap-4">
                {(["sqft", "flat"] as const).map((u) => (
                  <label key={u} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="unit"
                      checked={svcUnit === u}
                      onChange={() => setSvcUnit(u)}
                      className="accent-primary"
                    />
                    {u === "sqft" ? "Per sq ft" : "Flat rate"}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <SheetFooter>
            <Button onClick={saveService} className="w-full">Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
