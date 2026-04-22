import { useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { APP_NAME } from "@/lib/branding";

export default function Auth() {
  const { user, roles, isPortalUser, loading, signOut, mustChangePassword } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (user) {
    if (mustChangePassword) return <Navigate to="/auth/reset-password" replace />;
    if (roles.length > 0) return <Navigate to="/" replace />;
    if (isPortalUser) return <Navigate to="/portal" replace />;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 space-y-4">
          <h1 className="text-base font-semibold text-foreground">Account not provisioned</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your login is valid, but this account is not linked to an internal role or an active wholesale portal profile.
            Contact {APP_NAME} support to activate your account.
          </p>
          <Button variant="outline" className="w-full" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "Sign in failed", description: error.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="mx-auto h-10 w-10 rounded-lg bg-foreground flex items-center justify-center">
            <span className="text-sm font-bold text-background">R</span>
          </div>
          <h1 className="text-lg font-semibold text-foreground">{APP_NAME}</h1>
          <p className="text-xs text-muted-foreground">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="h-9"
            />
          </div>
          <Button type="submit" className="w-full h-9 text-sm" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="text-center text-[11px] text-muted-foreground">
          Accounts are provisioned by {APP_NAME} staff.
        </p>
      </div>
    </div>
  );
}
