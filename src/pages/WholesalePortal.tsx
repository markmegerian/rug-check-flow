import { useEffect, useState } from "react";
import PortalRugsTab from "@/components/portal/PortalRugsTab";
import PortalPickupsTab from "@/components/portal/PortalPickupsTab";
import PortalInvoicesTab from "@/components/portal/PortalInvoicesTab";
import PortalEstimatesTab from "@/components/portal/PortalEstimatesTab";
import PortalPricingTab from "@/components/portal/PortalPricingTab";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { usePortalClient } from "@/hooks/usePortalClient";
import { useToast } from "@/hooks/use-toast";
import { PortalOnboardingDialog } from "@/components/portal/PortalOnboardingDialog";

type Tab = "rugs" | "pickups" | "estimates" | "invoices" | "prices";

const TABS: { key: Tab; label: string }[] = [
  { key: "rugs", label: "Rugs" },
  { key: "pickups", label: "Pickups" },
  { key: "estimates", label: "Estimates" },
  { key: "invoices", label: "Invoices" },
  { key: "prices", label: "Prices" },
];

export default function WholesalePortal() {
  const { toast } = useToast();
  const {
    clientId,
    loading: portalClientLoading,
    onboardingCompletedAt,
    markOnboardingComplete,
  } = usePortalClient();
  const [activeTab, setActiveTab] = useState<Tab>("rugs");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [autoShownOnboarding, setAutoShownOnboarding] = useState(false);
  const activeTabLabel = TABS.find((tab) => tab.key === activeTab)?.label ?? "Rugs";

  useEffect(() => {
    if (portalClientLoading || autoShownOnboarding) return;
    if (!clientId || onboardingCompletedAt) return;
    setOnboardingOpen(true);
    setOnboardingStep(0);
    setActiveTab("rugs");
    setAutoShownOnboarding(true);
  }, [autoShownOnboarding, clientId, onboardingCompletedAt, portalClientLoading]);

  const openOnboarding = () => {
    setOnboardingStep(0);
    setActiveTab("rugs");
    setOnboardingOpen(true);
  };

  const completeOnboarding = async () => {
    if (onboardingCompletedAt) {
      setOnboardingOpen(false);
      return;
    }
    setOnboardingSaving(true);
    const success = await markOnboardingComplete();
    setOnboardingSaving(false);
    if (!success) {
      toast({
        title: "Unable to save onboarding status",
        description: "Please try again. You can continue using the portal now.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Onboarding complete", description: "You can reopen this walkthrough any time from this page." });
    setOnboardingOpen(false);
  };

  return (
    <AppShell
      title="Wholesale Portal"
      subtitle={`Pacific Rug Gallery · ${activeTabLabel}`}
      contentClassName="bg-gradient-to-b from-muted/40 to-background overflow-auto"
    >
      <div className="max-w-6xl mx-auto py-5">
        <div className="px-4 sm:px-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <nav className="flex gap-1 p-1 rounded-xl bg-card border shadow-sm w-full sm:w-fit">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    activeTab === tab.key
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            {clientId ? (
              <Button variant="outline" size="sm" onClick={openOnboarding}>
                {onboardingCompletedAt ? "View onboarding guide" : "Start onboarding guide"}
              </Button>
            ) : null}
          </div>
          <main className="rounded-xl border border-border bg-card p-3 md:p-4 shadow-sm">
            {activeTab === "rugs" && <PortalRugsTab />}
            {activeTab === "pickups" && <PortalPickupsTab />}
            {activeTab === "estimates" && <PortalEstimatesTab />}
            {activeTab === "invoices" && <PortalInvoicesTab />}
            {activeTab === "prices" && <PortalPricingTab />}
          </main>
        </div>
      </div>
      <PortalOnboardingDialog
        open={onboardingOpen}
        stepIndex={onboardingStep}
        completing={onboardingSaving}
        onOpenChange={setOnboardingOpen}
        onStepChange={setOnboardingStep}
        onFocusTab={(tab) => setActiveTab(tab)}
        onComplete={completeOnboarding}
      />
    </AppShell>
  );
}
