import { useState, useMemo } from "react";
import { ChevronDown, Pencil, Search, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import {
  type CheckInEntry,
  type UserRole,
  isEntryEditable,
} from "@/data/check-in-log";

interface CheckInLogPanelProps {
  entries: CheckInEntry[];
  userRole: UserRole;
  onEdit: (entryId: string) => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function CheckInLogPanel({ entries, userRole, onEdit }: CheckInLogPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [logSearch, setLogSearch] = useState("");

  const filteredEntries = useMemo(() => {
    if (!logSearch.trim()) return entries;
    const q = logSearch.toLowerCase();
    return entries.filter(
      (e) =>
        e.rugNumber.toLowerCase().includes(q) ||
        e.clientName.toLowerCase().includes(q)
    );
  }, [entries, logSearch]);

  return (
    <div className="flex flex-col border-l-0 md:border-l border-border bg-muted/20 h-full">
      <div className="px-3 py-2.5 border-b border-border">
        <h2 className="text-sm font-semibold">
          Today's Check-Ins{" "}
          <span className="text-muted-foreground font-normal">({entries.length})</span>
        </h2>
      </div>

      {entries.length > 3 && (
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter log…"
              className="h-7 pl-7 pr-7 text-xs"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
            />
            {logSearch && (
              <button
                onClick={() => setLogSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {filteredEntries.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground text-center">
              {logSearch ? "No matching entries" : "No check-ins yet today."}
            </p>
          )}

          {filteredEntries.map((entry) => {
            const editable = isEntryEditable(entry, userRole);
            const isOpen = openId === entry.id;

            return (
              <Collapsible
                key={entry.id}
                open={isOpen}
                onOpenChange={(open) => setOpenId(open ? entry.id : null)}
              >
                <CollapsibleTrigger asChild>
                  <button className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {formatTime(entry.checkedInAt)}
                      </span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-sm">
                          {entry.rugNumber}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2 truncate">
                          {entry.clientName}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-medium shrink-0">
                        ${entry.totalPrice.toFixed(2)}
                      </span>
                    </div>
                  </button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-3 pb-3 space-y-2 bg-muted/30">
                    <div className="text-xs text-muted-foreground">
                      {entry.rugType} · {entry.length}×{entry.width} ft
                    </div>

                    <div className="space-y-1">
                      {entry.services.map((svc) => (
                        <div
                          key={svc.id}
                          className="flex justify-between text-xs"
                        >
                          <span>{svc.name}</span>
                          <span className="font-mono">
                            ${svc.price.toFixed(2)}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-bold border-t border-border pt-1 mt-1">
                        <span>Total</span>
                        <span className="font-mono">
                          ${entry.totalPrice.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {editable && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-7 text-xs"
                        onClick={() => onEdit(entry.id)}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
