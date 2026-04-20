import { memo, useMemo, useState } from "react";
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

const CATEGORY_ORDER = ["Cleaning", "Repair", "Specialty", "Specialty Repair", "Other"];

const REPAIR_KEYWORDS = ["fringe", "bind", "binding", "overcast", "zenj", "pb", "mb", "leather", "glue"];
const SPECIALTY_REPAIR_KEYWORDS = ["stain removal", "color run", "patch", "reweave", "latex patch", "color restoration", "repair"];

const PRESETS = [
  { label: "Basic Clean", names: ["Standard Wash", "Standard Cleaning", "Hand Cleaning", "Hand Cleaning (Standard Cleaning)", "Basic Clean", "Regular Wash"] },
  { label: "Full Service", names: ["Deep Wash", "Scotchgard"] },
  { label: "Pet Owner", names: ["Pet Stain Treatment", "Odor Removal", "Scotchgard"] },
];

const ServiceCategoryGroup = memo(function ServiceCategoryGroup({
  category,
  services,
  isFirst,
  serviceIds,
  getLineTotal,
  toggleService,
  edgeSelections,
  setEdgeSelections,
  flatPrices,
  setFlatPrices,
  watchedLength,
  watchedWidth,
}: {
  category: string;
  services: DbService[];
  isFirst: boolean;
  serviceIds: Set<string>;
  getLineTotal: (serviceId: string) => number;
  toggleService: (id: string) => void;
  edgeSelections: Record<string, RugEdge[]>;
  setEdgeSelections: React.Dispatch<React.SetStateAction<Record<string, RugEdge[]>>>;
  flatPrices: Record<string, string>;
  setFlatPrices: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  watchedLength: number;
  watchedWidth: number;
}) {
  const [open, setOpen] = useState(true);
  const selectedCount = services.filter((s) => serviceIds.has(s.id)).length;

  return (
    <div className={!isFirst ? "border-t border-border" : ""}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted"
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
            const lineTotal = getLineTotal(svc.id);
            const checked = serviceIds.has(svc.id);
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
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">{svc.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {isLinear ? "per linear foot" : isFlat ? "price per rug" : svc.unit === "per sqft" ? "per square foot" : svc.unit}
                    </span>
                  </div>
                  {isFlat && !checked && (
                    <span className="shrink-0 text-xs text-muted-foreground">Custom price</span>
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
                      <span className="text-xs text-muted-foreground">saved</span>
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
});

ServiceCategoryGroup.displayName = "ServiceCategoryGroup";

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
}

export function CheckInServiceSelector({
  dbServices, watchedServices, toggleService, clearAll, setServices,
  getUnitPrice, getLineTotal, edgeSelections, setEdgeSelections,
  flatPrices, setFlatPrices, watchedLength, watchedWidth, tierLabel, error,
}: CheckInServiceSelectorProps) {
  const [serviceSearch, setServiceSearch] = useState("");

  const searchLower = serviceSearch.toLowerCase();
  const serviceIds = useMemo(() => new Set(watchedServices), [watchedServices]);

  const { grouped, categories } = useMemo(() => {
    const filteredServices = searchLower
      ? dbServices.filter((svc) => svc.name.toLowerCase().includes(searchLower))
      : dbServices;

    const categorizeService = (svc: DbService) => {
      const category = (svc.category ?? "").trim().toLowerCase();
      const name = svc.name.trim().toLowerCase();
      const unit = (svc.unit ?? "").trim().toLowerCase();

      if (category === "cleaning") return "Cleaning";
      if (unit === "per linear ft" || REPAIR_KEYWORDS.some((keyword) => name.includes(keyword))) return "Repair";
      if (unit === "flat" && SPECIALTY_REPAIR_KEYWORDS.some((keyword) => name.includes(keyword))) return "Specialty Repair";
      if (category === "specialty" || name.includes("moth") || name.includes("padding") || name.includes("sheering") || name.includes("blocking")) return "Specialty";
      return "Other";
    };

    const nextGrouped: Record<string, DbService[]> = {};
    filteredServices.forEach((svc) => {
      const cat = categorizeService(svc);
      if (!nextGrouped[cat]) nextGrouped[cat] = [];
      nextGrouped[cat].push(svc);
    });

    const nextCategories = CATEGORY_ORDER.filter((c) => nextGrouped[c]?.length).concat(
      Object.keys(nextGrouped).filter((c) => !CATEGORY_ORDER.includes(c))
    );

    return { grouped: nextGrouped, categories: nextCategories };
  }, [dbServices, searchLower]);

  return (
    <div className="space-y-3 md:space-y-4">
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

      <div className="rounded-[1rem] border border-border/70 bg-white/70 px-3 py-3 text-xs text-muted-foreground">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div><span className="font-medium text-foreground">Cleaning</span>, priced per square foot</div>
          <div><span className="font-medium text-foreground">Repairs</span>, priced per linear foot</div>
          <div><span className="font-medium text-foreground">Specialty</span>, priced per square foot</div>
          <div><span className="font-medium text-foreground">Specialty repairs</span>, custom price per rug</div>
        </div>
      </div>

      {dbServices.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {PRESETS.map((preset) => {
            const ids = preset.names
              .map((n) => dbServices.find((s) => s.name.toLowerCase() === n.toLowerCase())?.id)
              .filter(Boolean) as string[];
            if (ids.length === 0) return null;
            const allSelected = ids.length > 0 && ids.every((id) => serviceIds.has(id));
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
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  allSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-[0_14px_28px_-20px_rgba(59,108,235,0.28)]"
                    : "border-border bg-white/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
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
            className="h-10 rounded-xl border-border/80 bg-white/70 pl-8 text-sm"
            value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
          />
        </div>
      )}

      {dbServices.length === 0 && (
        <p className="text-sm text-muted-foreground italic">Loading services…</p>
      )}

      <div className="min-h-[20rem] max-h-[44vh] overflow-y-auto rounded-[1.15rem] border border-border/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(245,248,255,0.88))] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
        {categories.map((cat, catIdx) => (
          <ServiceCategoryGroup
            key={cat}
            category={cat}
            services={grouped[cat]}
            isFirst={catIdx === 0}
            serviceIds={serviceIds}
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
