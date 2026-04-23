import { Suspense, lazy, useEffect, useMemo, useState } from "react";
const PortalRugsTab = lazy(() => import("@/components/portal/PortalRugsTab"));
const PortalPickupsTab = lazy(() => import("@/components/portal/PortalPickupsTab"));
const PortalInvoicesTab = lazy(() => import("@/components/portal/PortalInvoicesTab"));
const PortalEstimatesTab = lazy(() => import("@/components/portal/PortalEstimatesTab"));
const PortalPricingTab = lazy(() => import("@/components/portal/PortalPricingTab"));
const PortalMessagesTab = lazy(() => import("@/components/portal/PortalMessagesTab"));
import { PortalAccountSnapshot } from "@/components/portal/PortalAccountSnapshot";
import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePortalClient } from "@/hooks/usePortalClient";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { PortalOnboardingDialog } from "@/components/portal/PortalOnboardingDialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Tab = "rugs" | "pickups" | "estimates" | "invoices" | "messages" | "prices";

const TABS: { key: Tab; label: string; path: string }[] = [
  { key: "rugs", label: "Rugs", path: "/portal/rugs" },
  { key: "pickups", label: "Pickups", path: "/portal/pickups" },
  { key: "estimates", label: "Estimates", path: "/portal/estimates" },
  { key: "invoices", label: "Invoices", path: "/portal/invoices" },
  { key: "messages", label: "Messages", path: "/portal/messages" },
  { key: "prices", label: "Prices", path: "/portal/prices" },
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
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedThreadId = searchParams.get("threadId");
  const routeTab = useMemo(
    () => TABS.find((tab) => location.pathname === tab.path)?.key ?? null,
    [location.pathname],
  );
  const [activeTab, setActiveTab] = useState<Tab>(routeTab ?? (requestedTab && TABS.some((tab) => tab.key === requestedTab) ? requestedTab as Tab : "rugs"));
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
    if (routeTab) {
      setActiveTab((current) => current === routeTab ? current : routeTab);
      return;
    }
    if (requestedTab && TABS.some((tab) => tab.key === requestedTab)) {
      setActiveTab((current) => current === requestedTab ? current : requestedTab as Tab);
    }
  }, [requestedTab, routeTab]);

  const changeTab = (nextTab: Tab) => {
    setActiveTab(nextTab);
    const target = TABS.find((tab) => tab.key === nextTab)?.path ?? "/portal/rugs";
    const next = new URLSearchParams();
    if (nextTab === "messages" && requestedThreadId) {
      next.set("threadId", requestedThreadId);
    }
    navigate(`${target}${next.toString() ? `?${next.toString()}` : ""}`);
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
      title="Client Portal"
      subtitle={activeTabLabel}
      contentClassName="overflow-auto"
    >
      <div className="app-page space-y-4">
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                {clientId ? <PortalAccountSnapshot clientId={clientId} onFocusTab={changeTab} /> : <div />}
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

              <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading portal view…</div>}>
                {activeTab === "rugs" ? (
                  <PortalRugsTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />
                ) : null}
                {activeTab === "pickups" ? (
                  <PortalPickupsTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />
                ) : null}
                {activeTab === "estimates" ? (
                  <PortalEstimatesTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />
                ) : null}
                {activeTab === "invoices" ? (
                  <PortalInvoicesTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />
                ) : null}
                {activeTab === "messages" ? (
                  <PortalMessagesTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />
                ) : null}
                {activeTab === "prices" ? (
                  <PortalPricingTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />
                ) : null}
              </Suspense>
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
