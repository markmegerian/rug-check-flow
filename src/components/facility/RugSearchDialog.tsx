import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useRugSearch } from "@/hooks/useRugSearch";

const STATUS_LABELS: Record<string, string> = {
  checked_in: "Checked In",
  in_production: "In Production",
  ready: "Ready",
  picked_up: "Picked Up",
};

interface RugSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectRug: (rugId: string) => void;
}

export function RugSearchDialog({ open, onOpenChange, onSelectRug }: RugSearchDialogProps) {
  const [query, setQuery] = useState("");
  const { data: results = [], isLoading } = useRugSearch(query);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const handleSelect = useCallback(
    (rugId: string) => {
      onOpenChange(false);
      onSelectRug(rugId);
    },
    [onOpenChange, onSelectRug]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search rugs by tag or description..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.trim().length < 2 ? (
          <CommandEmpty>Type at least 2 characters to search...</CommandEmpty>
        ) : isLoading ? (
          <CommandEmpty>Searching...</CommandEmpty>
        ) : results.length === 0 ? (
          <CommandEmpty>No rugs found.</CommandEmpty>
        ) : (
          <CommandGroup heading="Rugs">
            {results.map((rug) => (
              <CommandItem
                key={rug.id}
                value={`${rug.tag} ${rug.client_name ?? ""} ${rug.description}`}
                onSelect={() => handleSelect(rug.id)}
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
      </CommandList>
    </CommandDialog>
  );
}
