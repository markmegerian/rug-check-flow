import { useMemo } from "react";
import { Check, Circle, Clock, Package, Truck, Sparkles, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { type RugRow, STATUS_LABELS, PROGRESS_STEPS, formatDate } from "./portal-rug-types";

interface RugJourneyTimelineProps {
  rug: RugRow;
  className?: string;
}

type JourneyStep = {
  id: string;
  label: string;
  description: string;
  icon: typeof Check;
  state: "completed" | "active" | "upcoming";
  timestamp?: string;
};

const STEP_ICONS = {
  checked_in: Package,
  in_production: Sparkles,
  ready: Check,
  picked_up: Truck,
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  checked_in: "Rug received at facility and tagged for processing",
  in_production: "Professional cleaning and treatment in progress",
  ready: "Quality checked and ready for pickup or delivery",
  picked_up: "Delivered back to you",
};

function estimateTimestamp(checkedInAt: string, stepIndex: number, currentStepIndex: number): string | undefined {
  if (stepIndex > currentStepIndex) return undefined;
  if (stepIndex === 0) return checkedInAt;
  // Estimate intermediate timestamps based on typical processing times
  const baseDate = new Date(checkedInAt);
  const daysPerStep = 2;
  const estimated = new Date(baseDate.getTime() + stepIndex * daysPerStep * 24 * 60 * 60 * 1000);
  const now = new Date();
  return estimated > now ? now.toISOString() : estimated.toISOString();
}

export function RugJourneyTimeline({ rug, className }: RugJourneyTimelineProps) {
  const allSteps = [...PROGRESS_STEPS, "picked_up" as const];
  const currentStepIndex = allSteps.indexOf(rug.status);

  const steps: JourneyStep[] = useMemo(() => {
    return allSteps.map((stepId, i) => {
      let state: JourneyStep["state"] = "upcoming";
      if (i < currentStepIndex) state = "completed";
      else if (i === currentStepIndex) state = "active";

      return {
        id: stepId,
        label: STATUS_LABELS[stepId] ?? stepId,
        description: STEP_DESCRIPTIONS[stepId] ?? "",
        icon: STEP_ICONS[stepId as keyof typeof STEP_ICONS] ?? Circle,
        state,
        timestamp: state !== "upcoming"
          ? estimateTimestamp(rug.checked_in_at, i, currentStepIndex)
          : undefined,
      };
    });
  }, [rug.status, rug.checked_in_at, currentStepIndex]);

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2 mb-3">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Rug Journey
        </h4>
      </div>

      {/* Photo banner */}
      {rug.photo_url && (
        <div className="relative h-32 rounded-lg overflow-hidden mb-4">
          <img src={rug.photo_url} alt={rug.tag} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-2 left-3 flex items-center gap-1.5">
            <Camera className="h-3 w-3 text-white/80" />
            <span className="text-xs font-medium text-white">{rug.tag}</span>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative pl-6">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isLast = i === steps.length - 1;

          return (
            <div key={step.id} className="relative pb-6 last:pb-0">
              {/* Connecting line */}
              {!isLast && (
                <div
                  className={cn(
                    "absolute left-0 top-6 w-0.5 h-[calc(100%-12px)]",
                    step.state === "completed" ? "bg-primary" : "bg-muted"
                  )}
                  style={{ transform: "translateX(-1px)" }}
                />
              )}

              {/* Node */}
              <div
                className={cn(
                  "absolute left-0 top-1 h-5 w-5 rounded-full flex items-center justify-center -translate-x-[10px]",
                  step.state === "completed" && "bg-primary text-primary-foreground",
                  step.state === "active" && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  step.state === "upcoming" && "bg-muted text-muted-foreground border-2 border-border"
                )}
              >
                {step.state === "completed" ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
              </div>

              {/* Content */}
              <div className="ml-4">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-medium",
                      step.state === "upcoming" ? "text-muted-foreground" : "text-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                  {step.state === "active" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
                      </span>
                      Current
                    </span>
                  )}
                </div>
                <p className={cn(
                  "text-xs mt-0.5",
                  step.state === "upcoming" ? "text-muted-foreground/60" : "text-muted-foreground"
                )}>
                  {step.description}
                </p>
                {step.timestamp && (
                  <p className="text-[11px] text-muted-foreground/80 mt-1">
                    {formatDate(step.timestamp)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
