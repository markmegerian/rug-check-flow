import { useEffect, useState } from "react";
import PortalRugsTab from "@/components/portal/PortalRugsTab";
import PortalPickupsTab from "@/components/portal/PortalPickupsTab";
import PortalInvoicesTab from "@/components/portal/PortalInvoicesTab";
import PortalEstimatesTab from "@/components/portal/PortalEstimatesTab";
import PortalPricingTab from "@/components/portal/PortalPricingTab";
import PortalMessagesTab from "@/components/portal/PortalMessagesTab";
import { PortalAccountSnapshot } from "@/components/portal/PortalAccountSnapshot";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePortalClient } from "@/hooks/usePortalClient";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { PortalOnboardingDialog } from "@/components/portal/PortalOnboardingDialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Tab = "rugs" | "pickups" | "estimates" | "invoices" | "messages" | "prices";

const TABS: { key: Tab; label: string }[] = [
  { key: "rugs", label: "Rugs" },
  { key: "pickups", label: "Pickups" },
  { key: "estimates", label: "Estimates" },
  { key: "invoices", label: "Invoices" },
  { key: "messages", label: "Messages" },
  { key: "prices", label: "Prices" },
];

export default function WholesalePortal() {
  const { user } = useAuth();
  const { toast } = useToast();
  const {
    clientId,
    loading: portalClientLoading,
    errorMessage,
    onboardingCompletedAt,
    markOnboardingComplete,
    markPasswordChangeComplete,
    mustChangePassword: portalMustChangePassword,
  } = usePortalClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedThreadId = searchParams.get("threadId");
  const [activeTab, setActiveTab] = useState<Tab>(requestedTab && TABS.some((tab) => tab.key === requestedTab) ? requestedTab as Tab : "rugs");
  const [mountedTabs, setMountedTabs] = useState<Record<Tab, boolean>>({ rugs: true, pickups: false, estimates: false, invoices: false, messages: false, prices: false });
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const requiresPasswordReset = Boolean(clientId) && portalMustChangePassword;
  const onboardingUnlocked = Boolean(clientId) && !portalMustChangePassword;
  const activeTabLabel = TABS.find((tab) => tab.key === activeTab)?.label ?? "Rugs";

  useEffect(() => {
    if (requestedTab && TABS.some((tab) => tab.key === requestedTab)) {
      setActiveTab((current) => current === requestedTab ? current : requestedTab as Tab);
    }
  }, [requestedTab]);

  useEffect(() => {
    setMountedTabs((current) => current[activeTab] ? current : { ...current, [activeTab]: true });
  }, [activeTab]);

  useEffect(() => {
    if (!clientId || portalClientLoading || requiresPasswordReset) return;
    const timer = window.setTimeout(() => {
      setMountedTabs({ rugs: true, pickups: true, estimates: true, invoices: true, messages: true, prices: true });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [clientId, portalClientLoading, requiresPasswordReset]);

  const changeTab = (nextTab: Tab) => {
    setActiveTab(nextTab);
    if (searchParams.get("tab") === nextTab) return;
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next, { replace: true });
  };

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
    changeTab("rugs");
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
            <div className="flex flex-wrap gap-2 overflow-x-auto pb-1 sm:pb-0">
              {TABS.map((tab) => (
                <Button
                  key={tab.key}
                  type="button"
                  size="sm"
                  variant={activeTab === tab.key ? "default" : "outline"}
                  className="h-9 rounded-xl px-3 whitespace-nowrap"
                  onClick={() => changeTab(tab.key)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
            {clientId ? (
              <Button
                variant="outline"
                size="sm"
                className="h-10 rounded-xl px-4 text-xs self-start sm:self-auto"
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
            <div className="mx-auto max-w-md space-y-4 p-4 sm:p-6 lg:p-8">
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
            <div className="p-3 sm:p-4 md:p-6 space-y-4">
              {clientId ? <PortalAccountSnapshot clientId={clientId} onFocusTab={changeTab} /> : null}

              {mountedTabs.rugs ? (
                <div className={activeTab === "rugs" ? "block" : "hidden"}>
                  <PortalRugsTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />
                </div>
              ) : null}
              {mountedTabs.pickups ? (
                <div className={activeTab === "pickups" ? "block" : "hidden"}>
                  <PortalPickupsTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />
                </div>
              ) : null}
              {mountedTabs.estimates ? (
                <div className={activeTab === "estimates" ? "block" : "hidden"}>
                  <PortalEstimatesTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />
                </div>
              ) : null}
              {mountedTabs.invoices ? (
                <div className={activeTab === "invoices" ? "block" : "hidden"}>
                  <PortalInvoicesTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />
                </div>
              ) : null}
              {mountedTabs.messages ? (
                <div className={activeTab === "messages" ? "block" : "hidden"}>
                  <PortalMessagesTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />
                </div>
              ) : null}
              {mountedTabs.prices ? (
                <div className={activeTab === "prices" ? "block" : "hidden"}>
                  <PortalPricingTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />
                </div>
              ) : null}
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
        onFocusTab={(tab) => changeTab(tab)}
        onComplete={completeOnboarding}
      />
    </AppShell>
  );
}
