import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductionRugCard } from "./ProductionRugCard";
import { fetchProductionBoardSnapshot, type ProductionBoardRow } from "@/lib/production-board-snapshot";
import { RugDetailSheet } from "./RugDetailSheet";

export type DbRug = ProductionBoardRow;

function normalizeSearchValue(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getStageRank(status: string) {
  switch (status) {
    case "checked_in":
      return 0;
    case "in_production":
      return 1;
    case "ready":
      return 2;
    case "picked_up":
      return 3;
    default:
      return 4;
  }
}

export function ProductionBoard() {
  const { data: rugs = [], isLoading: loading } = useQuery({
    queryKey: ["production-board-snapshot"],
    queryFn: fetchProductionBoardSnapshot,
    staleTime: 30_000,
  });
  const [search, setSearch] = useState("");
  const [detailRugId, setDetailRugId] = useState<string | null>(null);

  const visibleRugs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const normalizedQuery = normalizeSearchValue(q);
    const queryTokens = q.split(/\s+/).filter(Boolean);
    const normalizedTokens = queryTokens.map((token) => normalizeSearchValue(token)).filter(Boolean);

    const filtered = q
      ? rugs.filter((rug) => {
          const rawValues = [
            rug.tag,
            rug.client_name ?? "",
            rug.description ?? "",
            rug.notes ?? "",
            ...rug.services.map((service) => service.name),
          ];
          const haystack = rawValues.join(" ").toLowerCase();
          const normalizedHaystack = normalizeSearchValue(haystack);

          return queryTokens.every((token) => haystack.includes(token)) ||
            normalizedTokens.every((token) => normalizedHaystack.includes(token));
        })
      : rugs;

    return [...filtered].sort((a, b) => {
      if (q) {
        const aTag = a.tag.toLowerCase();
        const bTag = b.tag.toLowerCase();
        const aClient = (a.client_name ?? "").toLowerCase();
        const bClient = (b.client_name ?? "").toLowerCase();
        const aTagNormalized = normalizeSearchValue(a.tag);
        const bTagNormalized = normalizeSearchValue(b.tag);
        const aClientNormalized = normalizeSearchValue(a.client_name);
        const bClientNormalized = normalizeSearchValue(b.client_name);

        const getSearchRank = (rawTag: string, rawClient: string, normalizedTag: string, normalizedClient: string) => {
          if (rawTag === q || normalizedTag === normalizedQuery) return 0;
          if (rawTag.startsWith(q) || normalizedTag.startsWith(normalizedQuery)) return 1;
          if (rawClient === q || normalizedClient === normalizedQuery) return 2;
          if (rawClient.startsWith(q) || normalizedClient.startsWith(normalizedQuery)) return 3;
          if (rawClient.includes(q) || normalizedClient.includes(normalizedQuery)) return 4;
          return 5;
        };

        const aRank = getSearchRank(aTag, aClient, aTagNormalized, aClientNormalized);
        const bRank = getSearchRank(bTag, bClient, bTagNormalized, bClientNormalized);
        if (aRank !== bRank) return aRank - bRank;
      }

      const stageDiff = getStageRank(a.status) - getStageRank(b.status);
      if (stageDiff !== 0) return stageDiff;
      return Date.parse(b.checked_in_at) - Date.parse(a.checked_in_at);
    });
  }, [rugs, search]);

  const openTopResult = () => {
    if (visibleRugs.length > 0) setDetailRugId(visibleRugs[0].id);
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-11 w-full max-w-md" />
        <Skeleton className="h-9 w-56" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b bg-muted/20 px-4 py-4 shrink-0 space-y-3">
        <div>
          <h2 className="text-base font-semibold">Production</h2>
          <p className="text-sm text-muted-foreground">Approved non-cleaning work queue only — rugs stay here until that work is finished.</p>
        </div>

        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                openTopResult();
              }
            }}
            placeholder="Search client name or rug number..."
            className="h-11 pl-9 text-base"
          />
        </div>

        {search.trim() && visibleRugs.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" size="sm" variant="outline" className="h-8 px-3" onClick={openTopResult}>
              Open top result
            </Button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {visibleRugs.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card px-4 py-10 text-center text-sm text-muted-foreground">
              No rugs match that search.
            </div>
          ) : (
            visibleRugs.map((rug) => (
              <ProductionRugCard
                key={rug.id}
                rug={rug}
                onViewDetail={setDetailRugId}
                deliveryDate={rug.delivery_target_date ?? undefined}
                deliveryStatus={rug.delivery_status ?? undefined}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <RugDetailSheet
        rugId={detailRugId}
        open={Boolean(detailRugId)}
        onOpenChange={(open) => { if (!open) setDetailRugId(null); }}
      />
    </div>
  );
}
