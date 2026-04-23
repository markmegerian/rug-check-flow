import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type PortalTab = "rugs" | "pickups" | "estimates" | "invoices";

type OnboardingStep = {
  tab: PortalTab;
  title: string;
  description: string;
  bullets: string[];
};

const STEPS: OnboardingStep[] = [
  {
    tab: "rugs",
    title: "See your rugs",
    description: "View active rugs and their current status.",
    bullets: [
      "Check which rugs are checked in, in progress, or ready.",
      "Open a rug to see more detail when needed.",
    ],
  },
  {
    tab: "pickups",
    title: "Request pickup",
    description: "Choose your next pickup and tell us which rugs are going out.",
    bullets: [
      "Request your next pickup date.",
      "Add rugs and save the list.",
    ],
  },
  {
    tab: "estimates",
    title: "Review estimates",
    description: "Approve or decline estimate work directly in the portal.",
    bullets: [
      "Open estimates that are ready for review.",
      "Past estimate decisions stay visible in history.",
    ],
  },
  {
    tab: "invoices",
    title: "View invoices",
    description: "Open invoice PDFs and review payment status.",
    bullets: [
      "Download invoices for your records.",
      "Check payment history when needed.",
    ],
  },
];

type PortalOnboardingDialogProps = {
  open: boolean;
  stepIndex: number;
  completing: boolean;
  onOpenChange: (open: boolean) => void;
  onStepChange: (index: number) => void;
  onFocusTab: (tab: PortalTab) => void;
  onComplete: () => Promise<void>;
};

export function PortalOnboardingDialog({
  open,
  stepIndex,
  completing,
  onOpenChange,
  onStepChange,
  onFocusTab,
  onComplete,
}: PortalOnboardingDialogProps) {
  const safeStepIndex = Math.min(Math.max(stepIndex, 0), STEPS.length - 1);
  const step = STEPS[safeStepIndex];
  const isFirstStep = safeStepIndex === 0;
  const isLastStep = safeStepIndex === STEPS.length - 1;

  const goToStep = (nextIndex: number) => {
    const boundedIndex = Math.min(Math.max(nextIndex, 0), STEPS.length - 1);
    onStepChange(boundedIndex);
    onFocusTab(STEPS[boundedIndex].tab);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Portal guide</DialogTitle>
          <DialogDescription>
            A quick walkthrough of the main portal sections.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {STEPS.map((item, index) => (
              <button
                key={item.tab}
                type="button"
                onClick={() => goToStep(index)}
                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                  index === safeStepIndex
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{step.tab}</Badge>
              <p className="text-sm font-semibold">{step.title}</p>
            </div>
            <p className="text-sm text-muted-foreground">{step.description}</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
              {step.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="outline" onClick={() => goToStep(safeStepIndex - 1)} disabled={isFirstStep}>
            Back
          </Button>
          {isLastStep ? (
            <Button onClick={onComplete} disabled={completing}>
              {completing ? "Saving..." : "Finish"}
            </Button>
          ) : (
            <Button onClick={() => goToStep(safeStepIndex + 1)}>Next</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
