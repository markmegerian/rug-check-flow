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
    <div className="flex flex-col h-full border-r border-border bg-muted/30">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Pending{" "}
          {rugs.length > 0 && (
            <span className="inline-flex items-center justify-center ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-primary text-primary-foreground">
              {rugs.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => setWalkInOpen(!walkInOpen)}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Walk-In
        </button>
      </div>

      {/* Walk-In Drop-Off */}
      {walkInOpen && (
        <div className="border-b border-border p-3 space-y-2">
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
        <div className="px-3 py-2 border-b border-border">
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
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-3">
          {filteredRugs.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              {queueSearch ? "No matching rugs" : "No pending rugs"}
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
