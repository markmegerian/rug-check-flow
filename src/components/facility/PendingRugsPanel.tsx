import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { type PendingRug } from "@/types/pending-rug";
import { supabase } from "@/integrations/supabase/client";

interface PendingRugsPanelProps {
  rugs: PendingRug[];
  selectedRugId: string | null;
  onSelectRug: (id: string) => void;
  onAddWalkIn: (clientName: string, rugNumber: string, clientId?: string | null) => void;
}

export function PendingRugsPanel({
  rugs,
  selectedRugId,
  onSelectRug,
  onAddWalkIn,
}: PendingRugsPanelProps) {
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<{ id: string | null; name: string } | null>(null);
  const [rugNumber, setRugNumber] = useState("");
  const [queueSearch, setQueueSearch] = useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = useState("");

  useEffect(() => {
    const trimmed = clientSearch.trim();
    const timer = window.setTimeout(() => {
      setDebouncedClientSearch(trimmed);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [clientSearch]);

  const canSearchClients = walkInOpen && debouncedClientSearch.length >= 2 && !selectedClient;

  const { data: filteredClients = [], isFetching: searchingClients } = useQuery({
    queryKey: ["pending-rugs-panel", "client-search", debouncedClientSearch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .ilike("name", `%${debouncedClientSearch}%`)
        .order("name")
        .limit(8);
      if (error) throw error;
      return (data ?? []).filter((client) => client.name);
    },
    enabled: canSearchClients,
    staleTime: 30_000,
  });

  const filteredRugs = useMemo(() => {
    if (!queueSearch.trim()) return rugs;
    const q = queueSearch.toLowerCase();
    return rugs.filter(
      (r) =>
        r.rugNumber.toLowerCase().includes(q) ||
        r.clientName.toLowerCase().includes(q) ||
        (r.rugType ?? "").toLowerCase().includes(q)
    );
  }, [rugs, queueSearch]);

  const grouped = useMemo(() => {
    const map = new Map<string, PendingRug[]>();
    for (const rug of filteredRugs) {
      const list = map.get(rug.clientName) ?? [];
      list.push(rug);
      map.set(rug.clientName, list);
    }
    return map;
  }, [filteredRugs]);

  const handleAddWalkIn = () => {
    if (!selectedClient || !rugNumber.trim()) return;
    onAddWalkIn(selectedClient.name, rugNumber.trim(), selectedClient.id);
    setSelectedClient(null);
    setClientSearch("");
    setRugNumber("");
    setWalkInOpen(false);
  };

  return (
    <div className="app-section flex h-full min-h-0 flex-col overflow-hidden">
      <div className="app-section-header gap-3 px-4 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Queue</p>
          <h2 className="mt-1 text-base font-semibold tracking-[-0.02em] text-foreground">
            Pending{" "}
            {rugs.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                {rugs.length}
              </span>
            )}
          </h2>
        </div>
        <button
          onClick={() => setWalkInOpen(!walkInOpen)}
          className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          <Plus className="h-3.5 w-3.5" />
          Walk-In
        </button>
      </div>

      {/* Walk-In Drop-Off */}
      {walkInOpen && (
        <div className="border-b border-border/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(246,248,255,0.48))] p-4 space-y-3">
          {!selectedClient ? (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search client…"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="pl-7 pr-8 h-8 text-sm"
                  autoFocus
                />
                {searchingClients && (
                  <Loader2 className="absolute right-2 top-2.5 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
              </div>

              {clientSearch.trim().length > 0 && clientSearch.trim().length < 2 && (
                <p className="text-[11px] text-muted-foreground">Type at least 2 letters to search existing clients.</p>
              )}

              {filteredClients.length > 0 && (
                <div className="bg-popover border border-border rounded-md shadow-sm overflow-hidden max-h-48 overflow-y-auto">
                  {filteredClients.map((client) => (
                    <button
                      key={client.id ?? client.name}
                      onClick={() => {
                        setSelectedClient({ id: client.id ?? null, name: client.name });
                        setClientSearch(client.name);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      {client.name}
                    </button>
                  ))}
                </div>
              )}

              {canSearchClients && !searchingClients && filteredClients.length === 0 && (
                <div className="rounded-md border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
                  No matching client found yet.
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Client: <span className="text-foreground font-medium">{selectedClient.name}</span>
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

      {/* Queue search */}
      {rugs.length > 3 && (
        <div className="border-b border-border/60 px-4 py-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Filter queue…"
              className="h-7 pl-7 pr-7 text-xs"
              value={queueSearch}
              onChange={(e) => setQueueSearch(e.target.value)}
            />
            {queueSearch && (
              <button
                onClick={() => setQueueSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pending Rugs List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {filteredRugs.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              {queueSearch ? "No matching rugs" : "No pending rugs"}
            </p>
          )}
          {Array.from(grouped.entries()).map(([client, clientRugs]) => (
            <div key={client}>
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {client} ({clientRugs.length})
              </p>
              <div className="space-y-0.5">
                {clientRugs.map((rug) => (
                  <button
                    key={rug.id}
                    onClick={() => onSelectRug(rug.id)}
                    className={cn(
                      "min-h-[4.75rem] w-full rounded-[1rem] border px-3 py-3 text-left transition-colors",
                      selectedRugId === rug.id
                        ? "border-primary/30 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(245,247,255,0.96))] shadow-[0_16px_35px_-28px_rgba(51,84,181,0.16)]"
                        : "border-transparent bg-white/55 hover:bg-white/78"
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
