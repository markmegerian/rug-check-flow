import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function ResetPassword() {
  const { user, loading, roles, isPortalUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
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
    const shouldMarkPortalPasswordChanged = isPortalUser;
    const { data: markedPortalPasswordChanged, error: markPortalPasswordChangedError } = shouldMarkPortalPasswordChanged
      ? await supabase.rpc("mark_portal_password_changed")
      : { data: true, error: null };
    setSubmitting(false);

    if (error) {
      toast({ title: "Password update failed", description: error.message, variant: "destructive" });
      return;
    }

    if (!markedPortalPasswordChanged || markPortalPasswordChangedError) {
      toast({
        title: "Password updated, but verification is pending",
        description: "Please sign out and sign in again. If this persists, contact support.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Password updated", description: "Sign-in is now unlocked." });
    if (isPortalUser) navigate("/portal", { replace: true });
    else if (roles.length > 0) navigate("/", { replace: true });
    else navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Change Password Required</h1>
          <p className="text-sm text-muted-foreground">You must set a new password before continuing.</p>
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
