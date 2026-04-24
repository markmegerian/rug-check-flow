import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const { user, loading, isPortalUser, refreshAuthState } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [awaitingRecoverySession, setAwaitingRecoverySession] = useState(false);

  const nextPath = useMemo(() => {
    const candidate = searchParams.get("next");
    return candidate && candidate.startsWith("/") ? candidate : "/portal/rugs";
  }, [searchParams]);

  const isPortalOnboardingFlow = searchParams.get("flow") === "portal-onboarding";
  const hasRecoveryHints = useMemo(() => {
    const hash = location.hash ?? "";
    return (
      searchParams.get("type") === "recovery"
      || searchParams.has("code")
      || searchParams.has("token_hash")
      || hash.includes("access_token=")
      || hash.includes("refresh_token=")
      || hash.includes("type=recovery")
    );
  }, [location.hash, searchParams]);

  useEffect(() => {
    if (!hasRecoveryHints || user) {
      setAwaitingRecoverySession(false);
      return;
    }

    setAwaitingRecoverySession(true);
    const timer = window.setTimeout(() => {
      setAwaitingRecoverySession(false);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [hasRecoveryHints, user]);

  if (loading || awaitingRecoverySession) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading…</p></div>;
  }

  if (!user) return <Navigate to="/auth" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({
      password,
      data: { ...user.user_metadata, must_change_password: false },
    });

    if (error) {
      setSubmitting(false);
      toast({ title: "Password update failed", description: error.message, variant: "destructive" });
      return;
    }

    if (isPortalUser) {
      const { data, error: markError } = await supabaseExtended.rpc("mark_portal_password_changed");
      const markErrorMessage = markError?.message?.toLowerCase() ?? "";
      const missingRpc = Boolean(markError) && (
        markErrorMessage.includes("mark_portal_password_changed")
        || markErrorMessage.includes("could not find the function")
      );
      if (!missingRpc && (markError || !data)) {
        setSubmitting(false);
        toast({
          title: "Password updated but portal unlock failed",
          description: "Please contact support so we can finish unlocking your portal access.",
          variant: "destructive",
        });
        return;
      }
    }

    const refreshed = await refreshAuthState();
    setSubmitting(false);

    if (refreshed.mustChangePassword) {
      toast({
        title: "Password updated, but portal access is still locked",
        description: "Please try once more in a moment. If it keeps happening, contact support.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Password updated",
      description: isPortalOnboardingFlow ? "Your portal is ready." : "Sign-in is now unlocked.",
    });

    if (refreshed.isPortalUser) {
      navigate(nextPath, { replace: true });
      return;
    }

    if (refreshed.roles.length > 0) {
      navigate("/", { replace: true });
      return;
    }

    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">{isPortalOnboardingFlow ? "Create your password" : "Change Password Required"}</h1>
          <p className="text-sm text-muted-foreground">{isPortalOnboardingFlow ? "Set your password to open the wholesale portal." : "You must set a new password before continuing."}</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm Password</Label>
            <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Saving…" : "Set New Password"}</Button>
        </form>
      </div>
    </div>
  );
}
