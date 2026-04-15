import { useMemo, useState } from "react";
import { AlertTriangle, Beaker, CheckCircle2, Clock3, GitBranch, Search, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useRugs, type RugWithServices } from "@/hooks/useRugs";

type LabRug = RugWithServices & {
  nextAction: string;
  attentionReason: string | null;
  blocked: boolean;
  blockedReason: string | null;
  checkAfterWash: boolean;
  unknownServiceCount: number;
  section: "needs_attention" | "ready_to_work" | "ready_clear" | "history";
};

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasCheckAfterWashSignal(rug: RugWithServices) {
  const combined = [
    rug.description ?? "",
    rug.notes ?? "",
    ...rug.services.map((service) => service.name),
  ].join(" ").toLowerCase();

  return combined.includes("check after wash") || combined.includes("post wash") || combined.includes("after wash");
}

function deriveLabRug(rug: RugWithServices): LabRug {
  const checkAfterWash = hasCheckAfterWashSignal(rug);
  const unknownServiceCount = rug.services.length;
  const hasServices = rug.services.length > 0;

  let nextAction = "Review rug";
  let attentionReason: string | null = null;
  let blocked = false;
  let blockedReason: string | null = null;
  let section: LabRug["section"] = "ready_to_work";

  if (rug.status === "picked_up") {
    nextAction = "History only";
    section = "history";
  } else if (checkAfterWash) {
    nextAction = "Post-wash review required";
    attentionReason = "Check-after-wash signal detected";
    blocked = true;
    blockedReason = "Do not treat as ready until post-wash review happens.";
    section = "needs_attention";
  } else if (!hasServices) {
    nextAction = "Confirm work scope";
    attentionReason = "No service lines attached";
    section = "needs_attention";
  } else if (rug.status === "ready") {
    nextAction = "Ready for handoff";
    blocked = false;
    section = "ready_clear";
  } else if (rug.status === "checked_in") {
    nextAction = "Review attached services and start work";
    section = "ready_to_work";
  } else if (rug.status === "in_production") {
    nextAction = "Continue work and confirm undecided services";
    section = "ready_to_work";
  }

  if (!checkAfterWash && rug.status !== "picked_up" && hasServices) {
    attentionReason = attentionReason ?? `Service approval state unknown on ${unknownServiceCount} line${unknownServiceCount === 1 ? "" : "s"}`;
  }

  return {
    ...rug,
    nextAction,
    attentionReason,
    blocked,
    blockedReason,
    checkAfterWash,
    unknownServiceCount,
    section,
  };
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
          rug.attentionReason ?? "",
          rug.blockedReason ?? "",
          ...rug.services.map((service) => service.name),
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

    const attentionDiff = Number(b.blocked) - Number(a.blocked);
    if (attentionDiff !== 0) return attentionDiff;
    return Date.parse(b.checked_in_at) - Date.parse(a.checked_in_at);
  });
}

function SectionCard({
  title,
  description,
  count,
  icon: Icon,
  tone,
}: {
  title: string;
  description: string;
  count: number;
  icon: typeof AlertTriangle;
  tone: "amber" | "blue" | "green" | "slate";
}) {
  const toneClass = {
    amber: "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30",
    blue: "border-blue-200 bg-blue-50 dark:border-blue-900/60 dark:bg-blue-950/30",
    green: "border-green-200 bg-green-50 dark:border-green-900/60 dark:bg-green-950/30",
    slate: "border-border bg-card",
  }[tone];

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </div>
        <Badge variant="secondary">{count}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function RugDecisionCard({ rug, onOpenRug }: { rug: LabRug; onOpenRug: (rugId: string) => void }) {
  return (
    <button
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
            {rug.blocked ? <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Blocked</Badge> : null}
            {rug.checkAfterWash ? <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Check after wash</Badge> : null}
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next Action</div>
              <div className="mt-1 text-sm font-medium text-foreground">{rug.nextAction}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Attention Reason</div>
              <div className="mt-1 text-sm text-foreground">{rug.attentionReason ?? "None surfaced"}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Completion</div>
              <div className="mt-1 text-sm text-foreground">{rug.blocked ? rug.blockedReason : "Not blocked by current Lab logic"}</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Service State Summary</div>
            <div className="flex flex-wrap gap-2">
              {rug.services.length > 0 ? rug.services.map((service, index) => (
                <Badge key={`${rug.id}-${service.name}-${index}`} variant="secondary">
                  {service.name} · approval unknown
                </Badge>
              )) : <Badge variant="secondary">No services attached</Badge>}
            </div>
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
  );
}

export function WorkflowLabTab({ onOpenRug }: { onOpenRug: (rugId: string) => void }) {
  const { data: rugs = [], isLoading } = useRugs();
  const [search, setSearch] = useState("");

  const labRugs = useMemo(() => rugs.map(deriveLabRug), [rugs]);
  const visibleRugs = useMemo(() => searchRugs(labRugs, search), [labRugs, search]);

  const sections = useMemo(() => ({
    needsAttention: visibleRugs.filter((rug) => rug.section === "needs_attention"),
    readyToWork: visibleRugs.filter((rug) => rug.section === "ready_to_work"),
    readyClear: visibleRugs.filter((rug) => rug.section === "ready_clear"),
    history: visibleRugs.filter((rug) => rug.section === "history"),
  }), [visibleRugs]);

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
            <p className="text-sm text-muted-foreground">Decision-and-execution prototype: surface what each rug is waiting on, why it is blocked, and what should happen next.</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            Experimental logic only. This Lab currently derives signals from existing data so we can feel the workflow before changing schema.
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <SectionCard
            title="Needs Attention"
            description="Rugs that should not quietly disappear: check-after-wash, missing scope, or other review-needed signals."
            count={sections.needsAttention.length}
            icon={AlertTriangle}
            tone="amber"
          />
          <SectionCard
            title="Ready to Work"
            description="Rugs with work attached that appear actionable right now, but still need better service-state truth."
            count={sections.readyToWork.length}
            icon={Clock3}
            tone="blue"
          />
          <SectionCard
            title="Ready / Clear"
            description="Rugs that look clear for handoff under the current experimental logic."
            count={sections.readyClear.length}
            icon={CheckCircle2}
            tone="green"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-card p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-primary" /> Service-state prototype</div>
            <p className="text-xs text-muted-foreground">Attached services are shown as <span className="font-medium text-foreground">approval unknown</span> instead of pretending they are approved.</p>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4 text-primary" /> Check-after-wash protection</div>
            <p className="text-xs text-muted-foreground">Any detectable post-wash review signal is elevated and treated as a block, not a note to forget later.</p>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><GitBranch className="h-4 w-4 text-primary" /> Next-action thinking</div>
            <p className="text-xs text-muted-foreground">Every rug gets a derived next action so staff do not have to interpret raw status alone.</p>
          </div>
        </div>

        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search any rug, client, service, next action, or note..."
            className="h-11 pl-9 text-base"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)
          ) : visibleRugs.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-card px-4 py-10 text-center text-sm text-muted-foreground">
              No rugs match that search.
            </div>
          ) : (
            <>
              {[
                {
                  title: search.trim() ? "Search Results" : "Needs Attention",
                  rugs: search.trim() ? visibleRugs.slice(0, 100) : sections.needsAttention,
                  description: search.trim() ? "Matching rugs across the experimental workflow model." : "These rugs need deliberate review so the next decision does not get forgotten.",
                },
                ...(!search.trim() ? [
                  {
                    title: "Ready to Work",
                    rugs: sections.readyToWork,
                    description: "Actionable rugs that appear workable right now under the current Lab logic.",
                  },
                  {
                    title: "Ready / Clear",
                    rugs: sections.readyClear,
                    description: "Rugs that look clear for handoff or the next downstream step.",
                  },
                  {
                    title: "History / Closed Loop",
                    rugs: sections.history,
                    description: "Picked-up rugs kept visible for reference and operational memory.",
                  },
                ] : []),
              ].map((section) => (
                <section key={section.title} className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{section.title}</h3>
                      <Badge variant="secondary">{section.rugs.length}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  </div>

                  {section.rugs.length === 0 ? (
                    <div className="rounded-lg border border-dashed bg-card px-4 py-6 text-sm text-muted-foreground">
                      Nothing in this queue right now.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {section.rugs.map((rug) => (
                        <RugDecisionCard key={`${section.title}-${rug.id}`} rug={rug} onOpenRug={onOpenRug} />
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
