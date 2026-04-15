import { useMemo, useState } from "react";
import { Beaker, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useRugs, type RugWithServices } from "@/hooks/useRugs";

type LabRug = RugWithServices & {
  nextAction: string;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function serviceBadgeClass(status: string) {
  if (status === "approved") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (status === "rejected") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
}

function hasCheckAfterWashSignal(rug: RugWithServices) {
  const combined = [
    rug.description ?? "",
    rug.notes ?? "",
    ...rug.services.map((service) => service.name),
  ].join(" ").toLowerCase();

  return combined.includes("check after wash") || combined.includes("post wash") || combined.includes("after wash");
}

function deriveNextAction(rug: RugWithServices) {
  const approvedCount = rug.services.filter((service) => service.approval_status === "approved").length;
  const pendingCount = rug.services.filter((service) => service.approval_status === "pending").length;
  const rejectedCount = rug.services.filter((service) => service.approval_status === "rejected").length;

  if (hasCheckAfterWashSignal(rug)) return "Post-wash review required";
  if (pendingCount > 0) return `Resolve ${pendingCount} pending service${pendingCount === 1 ? "" : "s"}`;
  if (approvedCount > 0 && rug.status === "checked_in") return "Start approved work";
  if (approvedCount > 0 && rug.status === "in_production") return "Continue approved work";
  if (approvedCount > 0 && rug.status === "ready") return "Ready for handoff";
  if (approvedCount === 0 && rejectedCount > 0) return "Review rejected scope";
  if (rug.status === "picked_up") return "History only";
  if (rug.services.length === 0) return "Add service scope";
  return "Review rug";
}

function searchRugs(rugs: LabRug[], search: string) {
  const q = search.trim().toLowerCase();
  const normalizedQuery = normalize(q);
  const tokens = q.split(/\s+/).filter(Boolean);
  const normalizedTokens = tokens.map((token) => normalize(token)).filter(Boolean);

  const filtered = q
    ? rugs.filter((rug) => {
        const rawValues = [
          rug.tag,
          rug.client_name ?? "",
          rug.description ?? "",
          rug.notes ?? "",
          rug.nextAction,
          ...rug.services.flatMap((service) => [service.name, service.approval_status]),
        ];
        const haystack = rawValues.join(" ").toLowerCase();
        const normalizedHaystack = normalize(haystack);
        return tokens.every((token) => haystack.includes(token)) || normalizedTokens.every((token) => normalizedHaystack.includes(token));
      })
    : rugs;

  return [...filtered].sort((a, b) => {
    if (q) {
      const aTag = a.tag.toLowerCase();
      const bTag = b.tag.toLowerCase();
      const aClient = (a.client_name ?? "").toLowerCase();
      const bClient = (b.client_name ?? "").toLowerCase();
      const aTagNormalized = normalize(a.tag);
      const bTagNormalized = normalize(b.tag);
      const aClientNormalized = normalize(a.client_name);
      const bClientNormalized = normalize(b.client_name);

      const getRank = (rawTag: string, rawClient: string, tagNorm: string, clientNorm: string) => {
        if (rawTag === q || tagNorm === normalizedQuery) return 0;
        if (rawTag.startsWith(q) || tagNorm.startsWith(normalizedQuery)) return 1;
        if (rawClient === q || clientNorm === normalizedQuery) return 2;
        if (rawClient.startsWith(q) || clientNorm.startsWith(normalizedQuery)) return 3;
        if (rawClient.includes(q) || clientNorm.includes(normalizedQuery)) return 4;
        return 5;
      };

      const aRank = getRank(aTag, aClient, aTagNormalized, aClientNormalized);
      const bRank = getRank(bTag, bClient, bTagNormalized, bClientNormalized);
      if (aRank !== bRank) return aRank - bRank;
    }

    const aPending = a.services.filter((service) => service.approval_status === "pending").length;
    const bPending = b.services.filter((service) => service.approval_status === "pending").length;
    if (aPending !== bPending) return bPending - aPending;

    return Date.parse(b.checked_in_at) - Date.parse(a.checked_in_at);
  });
}

export function WorkflowLabTab({ onOpenRug }: { onOpenRug: (rugId: string) => void }) {
  const { data: rugs = [], isLoading } = useRugs();
  const [search, setSearch] = useState("");

  const labRugs = useMemo(() => rugs.map((rug) => ({ ...rug, nextAction: deriveNextAction(rug) })), [rugs]);
  const visibleRugs = useMemo(() => searchRugs(labRugs, search), [labRugs, search]);
  const pendingCount = useMemo(() => visibleRugs.filter((rug) => rug.services.some((service) => service.approval_status === "pending")).length, [visibleRugs]);

  return (
    <div className="h-full flex flex-col">
      <div className="border-b bg-muted/20 px-4 py-4 shrink-0 space-y-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Beaker className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold">Workflow Lab</h2>
              <Badge variant="secondary">Experimental</Badge>
            </div>
            <p className="text-sm text-muted-foreground">Simple prototype: keep the focus on the single most important thing per rug — the next action.</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            {pendingCount} rug{pendingCount === 1 ? "" : "s"} currently have pending service decisions.
          </div>
        </div>

        <div className="rounded-xl border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> What changed in Lab</div>
          <p className="text-xs text-muted-foreground">This view now emphasizes only <span className="font-medium text-foreground">Next Action</span> and shows service lines as <span className="font-medium text-foreground">pending / approved / rejected</span> instead of pretending every attached service is approved.</p>
        </div>

        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search any rug, client, service, or next action..."
            className="h-11 pl-9 text-base"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
          ) : visibleRugs.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card px-4 py-10 text-center text-sm text-muted-foreground">
              No rugs match that search.
            </div>
          ) : (
            visibleRugs.slice(0, 100).map((rug) => (
              <button
                key={rug.id}
                type="button"
                onClick={() => onOpenRug(rug.id)}
                className="w-full rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/30"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-primary">{rug.tag}</span>
                      <Badge variant="outline">{rug.status}</Badge>
                      {rug.client_name ? <span className="text-sm text-muted-foreground">{rug.client_name}</span> : null}
                    </div>

                    <div className="rounded-lg bg-muted/40 p-3">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next Action</div>
                      <div className="mt-1 text-sm font-medium text-foreground">{rug.nextAction}</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {rug.services.length > 0 ? rug.services.map((service, index) => (
                        <Badge key={`${rug.id}-${service.name}-${index}`} className={serviceBadgeClass(service.approval_status)}>
                          {service.name} · {service.approval_status}
                        </Badge>
                      )) : <Badge variant="secondary">No services attached</Badge>}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenRug(rug.id);
                      }}
                    >
                      Open rug
                    </Button>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
