import { useMemo } from "react";
import { Check, Package, Truck, Sparkles, Clock } from "lucide-react";
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
};

const STEP_META: Record<string, { icon: typeof Check; description: string }> = {
  checked_in: { icon: Package, description: "Received at facility and tagged for processing" },
  in_production: { icon: Sparkles, description: "Professional cleaning and treatment in progress" },
  ready: { icon: Check, description: "Quality checked and ready for pickup or delivery" },
  picked_up: { icon: Truck, description: "Delivered back to you" },
};

const ALL_STEPS = [...PROGRESS_STEPS, "picked_up" as const];

export function RugJourneyTimeline({ rug, className }: RugJourneyTimelineProps) {
  const currentStepIndex = ALL_STEPS.indexOf(rug.status);

  const steps: JourneyStep[] = useMemo(() => {
    return ALL_STEPS.map((stepId, i) => {
      let state: JourneyStep["state"] = "upcoming";
      if (i < currentStepIndex) state = "completed";
      else if (i === currentStepIndex) state = "active";

      const meta = STEP_META[stepId] ?? { icon: Clock, description: "" };
      return {
        id: stepId,
        label: STATUS_LABELS[stepId] ?? stepId,
        description: meta.description,
        icon: meta.icon,
        state,
      };
    });
  }, [currentStepIndex]);

  return (
    <div className={cn("space-y-1", className)}>
      {/* Photo banner */}
      {rug.photo_url && (
        <div className="relative h-32 rounded-lg overflow-hidden mb-4">
          <img
            src={rug.photo_url}
            alt={rug.tag}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <div className="absolute bottom-2 left-3 text-xs font-medium text-white font-mono">
            {rug.tag}
          </div>
        </div>
      )}

      {/* Checked-in date as anchor */}
      <p className="text-xs text-muted-foreground mb-3">
        Checked in {formatDate(rug.checked_in_at)}
      </p>

      {/* Timeline */}
      <div className="relative pl-6">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const isLast = i === steps.length - 1;

          return (
            <div key={step.id} className="relative pb-5 last:pb-0">
              {/* Connecting line */}
              {!isLast && (
                <div
                  className={cn(
                    "absolute left-0 top-6 w-0.5 h-[calc(100%-8px)]",
                    step.state === "completed" ? "bg-primary" : "bg-muted"
                  )}
                  style={{ transform: "translateX(-1px)" }}
                />
              )}

              {/* Node */}
              <div
                className={cn(
                  "absolute left-0 top-0.5 h-5 w-5 rounded-full flex items-center justify-center -translate-x-[10px]",
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
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
