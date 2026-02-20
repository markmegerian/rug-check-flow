import { useState, useMemo, useEffect } from "react";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { type PendingRug } from "@/data/mock-pending-rugs";
import { supabase } from "@/integrations/supabase/client";

interface PendingRugsPanelProps {
  rugs: PendingRug[];
  selectedRugId: string | null;
  onSelectRug: (id: string) => void;
  onAddWalkIn: (clientName: string, rugNumber: string) => void;
}

export function PendingRugsPanel({
  rugs,
  selectedRugId,
  onSelectRug,
  onAddWalkIn,
}: PendingRugsPanelProps) {
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [rugNumber, setRugNumber] = useState("");
  const [clientNames, setClientNames] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from("clients")
      .select("name")
      .order("name")
      .then(({ data }) => {
        setClientNames((data ?? []).map((c) => c.name));
      });
  }, []);

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return [];
    const q = clientSearch.toLowerCase();
    return clientNames.filter((c) => c.toLowerCase().includes(q));
  }, [clientSearch, clientNames]);

  const grouped = useMemo(() => {
    const map = new Map<string, PendingRug[]>();
    for (const rug of rugs) {
      const list = map.get(rug.clientName) ?? [];
      list.push(rug);
      map.set(rug.clientName, list);
    }
    return map;
  }, [rugs]);

  const handleAddWalkIn = () => {
    if (!selectedClient || !rugNumber.trim()) return;
    onAddWalkIn(selectedClient, rugNumber.trim());
    setSelectedClient(null);
    setClientSearch("");
    setRugNumber("");
    setWalkInOpen(false);
  };

  return (
    <div className="flex flex-col h-full border-r border-border bg-muted/30">
      {/* Walk-In Drop-Off */}
      <div className="border-b border-border p-3 space-y-2">
        <button
          onClick={() => setWalkInOpen(!walkInOpen)}
          className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Walk-In Drop-Off
        </button>

        {walkInOpen && (
          <div className="space-y-2">
            {!selectedClient ? (
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search client…"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="pl-7 h-8 text-sm"
                  autoFocus
                />
                {filteredClients.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-md overflow-hidden">
                    {filteredClients.map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          setSelectedClient(c);
                          setClientSearch(c);
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Client: <span className="text-foreground font-medium">{selectedClient}</span>
                  <button
                    onClick={() => { setSelectedClient(null); setClientSearch(""); }}
                    className="ml-2 text-primary text-xs underline"
                  >
                    change
                  </button>
                </p>
                <div className="flex gap-1.5">
                  <Input
                    placeholder="Rug #"
                    value={rugNumber}
                    onChange={(e) => setRugNumber(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddWalkIn()}
                    className="h-8 text-sm font-mono flex-1"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-8 px-3"
                    onClick={handleAddWalkIn}
                    disabled={!rugNumber.trim()}
                  >
                    Add
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Pending Rugs List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {rugs.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              No pending rugs
            </p>
          )}
          {Array.from(grouped.entries()).map(([client, clientRugs]) => (
            <div key={client}>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                {client} ({clientRugs.length})
              </p>
              <div className="space-y-0.5">
                {clientRugs.map((rug) => (
                  <button
                    key={rug.id}
                    onClick={() => onSelectRug(rug.id)}
                    className={cn(
                      "w-full text-left px-2 py-2 rounded-md transition-colors",
                      selectedRugId === rug.id
                        ? "bg-accent ring-1 ring-primary/30"
                        : "hover:bg-muted"
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-sm font-bold">
                        {rug.rugNumber}
                      </span>
                      {rug.rugType && (
                        <span className="text-xs text-muted-foreground">
                          {rug.rugType}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {rug.length && rug.width && (
                        <span className="text-xs text-muted-foreground">
                          {rug.length}×{rug.width}
                        </span>
                      )}
                      {rug.requestedServices.length > 0 && (
                        <span className="text-xs text-muted-foreground truncate">
                          {rug.requestedServices.join(", ")}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
