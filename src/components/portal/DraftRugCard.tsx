import { memo } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RUG_TYPES, SERVICES, SERVICE_CATEGORIES } from "@/data/services";
import { numericOnly } from "@/lib/format-helpers";
import type { PickupRugEntry } from "@/types/portal";

interface DraftRugCardProps {
  rug: PickupRugEntry;
  isExpanded: boolean;
  isDuplicate: boolean;
  onToggleExpand: () => void;
  onUpdate: (field: keyof PickupRugEntry, value: string | number | boolean) => void;
  onRemove: () => void;
  onToggleService: (serviceName: string) => void;
}

export const DraftRugCard = memo(function DraftRugCard({
  rug,
  isExpanded,
  isDuplicate,
  onToggleExpand,
  onUpdate,
  onRemove,
  onToggleService,
}: DraftRugCardProps) {
  const summaryParts: string[] = [];
  if (rug.rugType) summaryParts.push(rug.rugType);
  if (rug.length > 0 || rug.width > 0) summaryParts.push(`${rug.length || 0}' × ${rug.width || 0}'`);
  const serviceCount = (rug.requestedServices ?? []).length;

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Collapsed / header row */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggleExpand}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleExpand(); } }}
      >
        <span className="text-muted-foreground shrink-0">
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        <span className="text-sm font-semibold font-mono shrink-0">
          {rug.label ? `#${rug.label}` : "New rug"}
        </span>
        {!isExpanded && summaryParts.length > 0 && (
          <span className="text-xs text-muted-foreground truncate">
            {summaryParts.join(" · ")}
          </span>
        )}
        {!isExpanded && serviceCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
            {serviceCount} service{serviceCount !== 1 ? "s" : ""}
          </span>
        )}
        <div className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label={`Remove rug ${rug.label || "draft"}`}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div className="border-t p-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Rug #</label>
              <Input
                placeholder="e.g. 1234"
                value={rug.label}
                onChange={(e) => onUpdate("label", numericOnly(e.target.value))}
                className={`h-9 font-mono ${isDuplicate ? "border-destructive" : ""}`}
              />
              {isDuplicate && <p className="text-xs text-destructive mt-0.5">Duplicate</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Rug type</label>
              <Select
                value={rug.rugType || undefined}
                onValueChange={(v) => onUpdate("rugType", v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {RUG_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Length (ft)</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="e.g. 9.10"
                value={rug.length > 0 ? rug.length : ""}
                onChange={(e) => onUpdate("length", Math.max(0, parseFloat(e.target.value) || 0))}
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Width (ft)</label>
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="e.g. 2.09"
                value={rug.width > 0 ? rug.width : ""}
                onChange={(e) => onUpdate("width", Math.max(0, parseFloat(e.target.value) || 0))}
                className="h-9"
              />
            </div>
          </div>

          {/* Requested services */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1.5">Requested services</label>
            {SERVICE_CATEGORIES.map((cat) => {
              const catServices = SERVICES.filter((s) => s.category === cat);
              if (catServices.length === 0) return null;
              return (
                <div key={cat} className="mb-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{cat}</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {catServices.map((svc) => {
                      const selected = (rug.requestedServices ?? []).includes(svc.name);
                      return (
                        <button
                          key={svc.id}
                          type="button"
                          onClick={() => onToggleService(svc.name)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {svc.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Additional notes */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Additional notes</label>
            <Input
              placeholder="Anything else we should know about this rug…"
              value={rug.estimateDetails ?? ""}
              onChange={(e) => onUpdate("estimateDetails", e.target.value)}
              className="h-9 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
});
