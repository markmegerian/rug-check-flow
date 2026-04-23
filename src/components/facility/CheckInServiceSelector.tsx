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
  requires_estimate?: boolean | null;
}

const CATEGORY_ORDER = ["Cleaning", "Repair", "Specialty", "Specialty Repair", "Other"];

const REPAIR_KEYWORDS = ["fringe", "bind", "binding", "overcast", "zenj", "pb", "mb", "leather", "glue"];
const SPECIALTY_REPAIR_KEYWORDS = ["stain removal", "color run", "patch", "reweave", "latex patch", "color restoration", "repair"];

const ServiceCategoryGroup = memo(function ServiceCategoryGroup({
  category,
  services,
  isFirst,
  serviceIds,
  toggleService,
  requiresCustomPrice,
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
  toggleService: (id: string) => void;
  requiresCustomPrice: (svc: DbService) => boolean;
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
            const checked = serviceIds.has(svc.id);
            const isFlat = svc.unit === "flat";
            const isLinear = svc.unit === "per linear ft";
            const needsCustomPrice = requiresCustomPrice(svc);
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
                  <div className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="truncate text-sm">{svc.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {isLinear ? "/lft" : isFlat ? "/rug" : svc.unit === "per sqft" ? "/sqft" : svc.unit}
                    </span>
                  </div>
                  {isFlat && !checked && (
                    <span className="shrink-0 text-xs text-muted-foreground">{needsCustomPrice ? "Quote required" : "Custom price"}</span>
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
                {checked && isFlat && needsCustomPrice && (
                  <div className="ml-8 mt-1 mb-1 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Quote $</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      placeholder="Enter quote"
                      className="h-8 w-28"
                      value={flatPrices[svc.id] ?? ""}
                      onChange={(e) => setFlatPrices((prev) => ({ ...prev, [svc.id]: e.target.value }))}
                    />
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
  requiresCustomPrice: (svc: DbService) => boolean;
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
  requiresCustomPrice, edgeSelections, setEdgeSelections,
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
          <span className="rounded bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
            {tierLabel}
          </span>
        )}
      </div>

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
            toggleService={toggleService}
            requiresCustomPrice={requiresCustomPrice}
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
