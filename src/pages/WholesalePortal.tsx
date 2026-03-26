import { useState } from "react";
import PortalRugsTab from "@/components/portal/PortalRugsTab";
import PortalPickupsTab from "@/components/portal/PortalPickupsTab";
import PortalInvoicesTab from "@/components/portal/PortalInvoicesTab";
import PortalEstimatesTab from "@/components/portal/PortalEstimatesTab";
import PortalPricingTab from "@/components/portal/PortalPricingTab";
import { PortalAccountSnapshot } from "@/components/portal/PortalAccountSnapshot";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePortalClient } from "@/hooks/usePortalClient";
import { useToast } from "@/hooks/use-toast";
import { PortalOnboardingDialog } from "@/components/portal/PortalOnboardingDialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Tab = "rugs" | "pickups" | "estimates" | "invoices" | "prices";

const TABS: { key: Tab; label: string }[] = [
  { key: "rugs", label: "Rugs" },
  { key: "pickups", label: "Pickups" },
  { key: "estimates", label: "Estimates" },
  { key: "invoices", label: "Invoices" },
  { key: "prices", label: "Prices" },
];

export default function WholesalePortal() {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    clientId,
    loading: _portalClientLoading,
    onboardingCompletedAt,
    markOnboardingComplete,
    markPasswordChangeComplete,
    mustChangePassword: portalMustChangePassword,
  } = usePortalClient();
  const [activeTab, setActiveTab] = useState<Tab>("rugs");
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const activeTabLabel = TABS.find((tab) => tab.key === activeTab)?.label ?? "Rugs";
  const requiresPasswordReset = Boolean(clientId) && portalMustChangePassword;
  const onboardingUnlocked = Boolean(clientId) && !portalMustChangePassword;

  const openOnboarding = () => {
    if (requiresPasswordReset) {
      toast({
        title: "Password update required",
        description: "Change your password first, then onboarding will unlock.",
        variant: "destructive",
      });
      return;
    }
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

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { ...(user?.user_metadata ?? {}), must_change_password: false },
    });
    const markedComplete = error ? false : await markPasswordChangeComplete();
    setChangingPassword(false);
    if (error) {
      toast({ title: "Password update failed", description: error.message, variant: "destructive" });
      return;
    }
    if (!markedComplete) {
      toast({
        title: "Password updated, but verification is pending",
        description: "Please sign out and sign in again. If this persists, contact support.",
        variant: "destructive",
      });
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    toast({ title: "Password updated", description: "You can now start the onboarding guide." });
  };

  return (
    <AppShell
      title="Wholesale Portal"
      subtitle={activeTabLabel}
      contentClassName="overflow-auto"
    >
      <div className="app-page space-y-4">
        <section className="app-hero space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card/90 p-1 scrollbar-hide sm:w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
          {clientId ? (
            <Button
              variant="outline"
              size="sm"
              className="h-10 rounded-xl px-4 text-xs"
              onClick={openOnboarding}
              disabled={!onboardingUnlocked}
            >
              {onboardingCompletedAt
                ? "View guide"
                : onboardingUnlocked
                  ? "Start onboarding"
                  : "Change password to unlock"}
            </Button>
          ) : null}
          </div>
        </section>

        <div className="overflow-hidden rounded-3xl border border-border/70 bg-card/95 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
          {requiresPasswordReset ? (
            <div className="mx-auto max-w-md space-y-4 p-6 sm:p-8">
              <h2 className="text-base font-semibold">Change your password to continue</h2>
              <p className="text-sm text-muted-foreground">
                For security, first-time portal sign in requires a password change.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  className="h-11 rounded-2xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-xs">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  className="h-11 rounded-2xl"
                />
              </div>
              <Button onClick={handleChangePassword} disabled={changingPassword || !user} size="sm" className="h-11 rounded-2xl px-4">
                {changingPassword ? "Updating..." : "Update password"}
              </Button>
            </div>
          ) : (
            <div className="p-4 md:p-6 space-y-4">
              {clientId ? <PortalAccountSnapshot clientId={clientId} /> : null}
              {activeTab === "rugs" && <PortalRugsTab />}
              {activeTab === "pickups" && <PortalPickupsTab />}
              {activeTab === "estimates" && <PortalEstimatesTab />}
              {activeTab === "invoices" && <PortalInvoicesTab />}
              {activeTab === "prices" && <PortalPricingTab />}
            </div>
          )}
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
