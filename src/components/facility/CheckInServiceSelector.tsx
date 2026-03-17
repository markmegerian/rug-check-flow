import { useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import RugEdgeDiagram from "./RugEdgeDiagram";
import { calcSelectedLinearFt, type RugEdge } from "@/lib/rug-edges";

export interface DbService {
  id: string;
  name: string;
  unit: string;
  base_price: number;
  preferred_price: number;
  vip_price: number;
  category: string;
}

const CATEGORY_ORDER = ["Cleaning", "Repair", "Protection", "Specialty"];

const PRESETS = [
  { label: "Basic Clean", names: ["Standard Wash"] },
  { label: "Full Service", names: ["Deep Wash", "Scotchgard"] },
  { label: "Pet Owner", names: ["Pet Stain Treatment", "Odor Removal", "Scotchgard"] },
];

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

interface CheckInServiceSelectorProps {
  dbServices: DbService[];
  watchedServices: string[];
  toggleService: (id: string) => void;
  clearAll: () => void;
  setServices: (ids: string[]) => void;
  getUnitPrice: (svc: DbService) => number;
  getLineTotal: (svc: DbService) => number;
  edgeSelections: Record<string, RugEdge[]>;
  setEdgeSelections: React.Dispatch<React.SetStateAction<Record<string, RugEdge[]>>>;
  flatPrices: Record<string, string>;
  setFlatPrices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  watchedLength: number;
  watchedWidth: number;
  tierLabel: string | null;
  error?: string;
  loadError?: boolean;
}

export function CheckInServiceSelector({
  dbServices, watchedServices, toggleService, clearAll, setServices,
  getUnitPrice, getLineTotal, edgeSelections, setEdgeSelections,
  flatPrices, setFlatPrices, watchedLength, watchedWidth, tierLabel, error, loadError,
}: CheckInServiceSelectorProps) {
  const [serviceSearch, setServiceSearch] = useState("");

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

  return (
    <div className="space-y-2 md:space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-sm md:text-base">Services</Label>
          {watchedServices.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
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
      {dbServices.length > 0 && (
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
                    setServices(watchedServices.filter((id) => !ids.includes(id)));
                  } else {
                    setServices(Array.from(new Set([...watchedServices, ...ids])));
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
      )}

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

      {dbServices.length === 0 && !loadError && (
        <p className="text-sm text-muted-foreground italic">Loading services…</p>
      )}
      {loadError && (
        <p className="text-sm text-destructive">Failed to load services. Check your connection and refresh.</p>
      )}

      <div className="max-h-[40vh] overflow-y-auto border border-border rounded-md">
        {categories.map((cat, catIdx) => (
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
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
