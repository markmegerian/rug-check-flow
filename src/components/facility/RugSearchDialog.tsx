import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { useRugSearch } from "@/hooks/useRugSearch";
import { supabase } from "@/integrations/supabase/client";

const STATUS_LABELS: Record<string, string> = {
  checked_in: "Checked In",
  in_production: "In Production",
  ready: "Ready",
  picked_up: "Picked Up",
};

function useClientSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["clientSearch", trimmed],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, email, pricing_tier")
        .ilike("name", `%${trimmed}%`)
        .order("name")
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
    enabled: trimmed.length >= 2,
    staleTime: 10_000,
  });
}

interface RugSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectRug: (rugId: string) => void;
}

export function RugSearchDialog({ open, onOpenChange, onSelectRug }: RugSearchDialogProps) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { data: rugResults = [], isLoading: rugsLoading } = useRugSearch(query);
  const { data: clientResults = [], isLoading: clientsLoading } = useClientSearch(query);
  const isLoading = rugsLoading || clientsLoading;

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const handleSelectRug = useCallback(
    (rugId: string) => {
      onOpenChange(false);
      onSelectRug(rugId);
    },
    [onOpenChange, onSelectRug]
  );

  const handleSelectClient = useCallback(
    (clientId: string) => {
      onOpenChange(false);
      navigate(`/facility/office?tab=clients&search=${clientId}`);
    },
    [onOpenChange, navigate]
  );

  const hasResults = rugResults.length > 0 || clientResults.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search rugs, clients…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.trim().length < 2 ? (
          <CommandEmpty>Type at least 2 characters to search…</CommandEmpty>
        ) : isLoading ? (
          <CommandEmpty>Searching…</CommandEmpty>
        ) : !hasResults ? (
          <CommandEmpty>No results found.</CommandEmpty>
        ) : (
          <>
            {rugResults.length > 0 && (
              <CommandGroup heading="Rugs">
                {rugResults.map((rug) => (
                  <CommandItem
                    key={rug.id}
                    value={`rug ${rug.tag} ${rug.client_name ?? ""} ${rug.description}`}
                    onSelect={() => handleSelectRug(rug.id)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <span className="font-mono font-bold text-sm shrink-0">{rug.tag}</span>
                    {rug.client_name && (
                      <span className="text-sm text-muted-foreground truncate">{rug.client_name}</span>
                    )}
                    <span className="ml-auto flex items-center gap-2 shrink-0">
                      {(rug.size_length || rug.size_width) && (
                        <span className="text-xs text-muted-foreground">
                          {rug.size_length ?? "?"}x{rug.size_width ?? "?"} ft
                        </span>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {STATUS_LABELS[rug.status] ?? rug.status}
                      </Badge>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {rugResults.length > 0 && clientResults.length > 0 && <CommandSeparator />}
            {clientResults.length > 0 && (
              <CommandGroup heading="Clients">
                {clientResults.map((client) => (
                  <CommandItem
                    key={client.id}
                    value={`client ${client.name} ${client.email ?? ""}`}
                    onSelect={() => handleSelectClient(client.id)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <span className="text-sm font-medium">{client.name}</span>
                    {client.email && (
                      <span className="text-xs text-muted-foreground truncate">{client.email}</span>
                    )}
                    {client.pricing_tier && client.pricing_tier !== "standard" && (
                      <Badge variant="outline" className="text-xs ml-auto shrink-0">
                        {client.pricing_tier}
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
