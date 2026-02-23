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
    tab: "pickups",
    title: "Schedule pickups quickly",
    description: "Request a pickup by selecting rugs on file or adding new rugs for pickup.",
    bullets: [
      "Pick a date (defaults to your next route day).",
      "Add rugs (name/type/size) and submit your pickup request.",
      "Edit or cancel pending requests before they are confirmed.",
    ],
  },
  {
    tab: "rugs",
    title: "Track your rugs in one place",
    description: "See every active rug with current status and service details.",
    bullets: [
      "Use Rugs to confirm which pieces are checked in, in production, or ready.",
      "Open each row for service and condition context when needed.",
    ],
  },
  {
    tab: "estimates",
    title: "Approve estimates without back-and-forth",
    description: "Review estimate totals and approve or reject directly in portal.",
    bullets: [
      "Pending approvals appear first so your team can move work forward fast.",
      "History remains visible for audit and pricing review.",
    ],
  },
  {
    tab: "invoices",
    title: "Download invoices and review payment timeline",
    description: "Access invoice PDFs and payment attempt history in one view.",
    bullets: [
      "Use Download to save invoice PDFs for your records.",
      "Review payment attempt statuses to resolve billing issues quickly.",
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
          <DialogTitle>Welcome to your Wholesale Portal</DialogTitle>
          <DialogDescription>
            Quick guided walkthrough to help your team get value immediately.
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

          <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
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
            Remind me later
          </Button>
          <Button variant="outline" onClick={() => goToStep(safeStepIndex - 1)} disabled={isFirstStep}>
            Back
          </Button>
          {isLastStep ? (
            <Button onClick={onComplete} disabled={completing}>
              {completing ? "Saving..." : "Finish onboarding"}
            </Button>
          ) : (
            <Button onClick={() => goToStep(safeStepIndex + 1)}>Next</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
