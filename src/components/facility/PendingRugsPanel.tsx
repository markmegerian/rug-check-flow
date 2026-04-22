import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { type PendingRug } from "@/types/pending-rug";

interface PendingRugsPanelProps {
  rugs: PendingRug[];
  selectedRugId: string | null;
  onSelectRug: (id: string) => void;
}

export function PendingRugsPanel({
  rugs,
  selectedRugId,
  onSelectRug,
}: PendingRugsPanelProps) {
  const [queueSearch, setQueueSearch] = useState("");

  const filteredRugs = useMemo(() => {
    if (!queueSearch.trim()) return rugs;
    const q = queueSearch.toLowerCase();
    return rugs.filter(
      (r) =>
        r.rugNumber.toLowerCase().includes(q) ||
        r.clientName.toLowerCase().includes(q),
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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-border/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,248,255,0.9))] shadow-[0_24px_60px_-40px_rgba(28,39,56,0.16)]">
      <div className="shrink-0 border-b border-border/60 px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Truck pickup queue</p>
        <h2 className="mt-1 text-base font-semibold tracking-[-0.02em] text-foreground">
          Pending rugs
          <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
            {rugs.length}
          </span>
        </h2>
      </div>

      <div className="shrink-0 border-b border-border/60 px-4 py-3">
        <div className="relative min-h-[2rem]">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Filter pending rugs…"
            className="h-8 pl-7 pr-7 text-xs"
            value={queueSearch}
            onChange={(e) => setQueueSearch(e.target.value)}
          />
          {queueSearch ? (
            <button
              onClick={() => setQueueSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          ) : <span className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2" aria-hidden="true" />}
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-3 p-3">
          {filteredRugs.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {queueSearch ? "No matching rugs" : "No pending rugs"}
            </p>
          ) : null}

          {Array.from(grouped.entries()).map(([client, clientRugs]) => (
            <div key={client}>
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {client}
              </p>
              <div className="space-y-1">
                {clientRugs.map((rug) => (
                  <button
                    key={rug.id}
                    onClick={() => onSelectRug(rug.id)}
                    className={cn(
                      "min-h-[4.25rem] w-full rounded-[1rem] border px-3 py-3 text-left transition-colors",
                      selectedRugId === rug.id
                        ? "border-primary/30 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(245,247,255,0.96))] shadow-[0_16px_35px_-28px_rgba(51,84,181,0.16)]"
                        : "border-transparent bg-white/55 hover:bg-white/78",
                    )}
                  >
                    <span className="font-mono text-sm font-bold text-foreground">{rug.rugNumber}</span>
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
