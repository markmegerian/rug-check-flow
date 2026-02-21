import { useState } from "react";
import { Bug, X, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ROLES = ["admin", "office", "checkin_staff", "driver"] as const;

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  office: "Office",
  checkin_staff: "Check-in Staff",
  driver: "Driver",
};
const devSwitcherEnabled =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_SWITCHER === "true";

export function DevAccountSwitcher() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  if (!devSwitcherEnabled) return null;

  const switchTo = async (role: string) => {
    setSwitching(role);
    try {
      // Call edge function to ensure test user exists and get credentials
      const { data, error: fnErr } = await supabase.functions.invoke("dev-login", {
        body: { role },
      });

      if (fnErr || data?.error) {
        throw new Error(data?.error || fnErr?.message || "Unknown error");
      }

      // Sign out current user first
      await supabase.auth.signOut();

      // Sign in with the test credentials
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) throw error;

      toast({ title: `Switched to ${ROLE_LABELS[role]}` });
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: `Login failed (${role})`,
        description: message,
        variant: "destructive",
      });
    } finally {
      setSwitching(null);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        title="Dev Account Switcher"
      >
        <Bug className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed bottom-16 right-4 z-50 w-64 rounded-lg border border-border bg-card shadow-xl p-3 space-y-2 animate-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Quick Switch</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {ROLES.map((role) => (
            <Button
              key={role}
              variant="outline"
              size="sm"
              className="w-full justify-start h-9 text-sm"
              disabled={switching !== null}
              onClick={() => switchTo(role)}
            >
              <LogIn className="h-3.5 w-3.5 mr-2 shrink-0" />
              {switching === role ? "Signing in…" : ROLE_LABELS[role]}
            </Button>
          ))}
        </div>
      )}
    </>
  );
}
