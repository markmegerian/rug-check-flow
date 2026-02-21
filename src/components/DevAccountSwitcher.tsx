import { useState, useEffect } from "react";
import { Bug, X, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ROLES = ["admin", "office", "checkin_staff", "driver"] as const;
const STORAGE_KEY = "rugboost_dev_accounts";

type SavedAccounts = Record<string, { email: string; password: string }>;

export function DevAccountSwitcher() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<SavedAccounts>({});
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setAccounts(JSON.parse(stored));
    } catch {}
  }, []);

  const saveAccount = (role: string) => {
    if (!editEmail || !editPassword) return;
    const next = { ...accounts, [role]: { email: editEmail, password: editPassword } };
    setAccounts(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setEditingRole(null);
    setEditEmail("");
    setEditPassword("");
  };

  const switchTo = async (role: string) => {
    const acct = accounts[role];
    if (!acct) {
      setEditingRole(role);
      return;
    }
    setSwitching(role);
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({
      email: acct.email,
      password: acct.password,
    });
    setSwitching(null);
    if (error) {
      toast({ title: `Login failed (${role})`, description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Switched to ${role}` });
      setOpen(false);
    }
  };

  // Visible in all environments for internal ops tool

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
        <div className="fixed bottom-16 right-4 z-50 w-72 rounded-lg border border-border bg-card shadow-xl p-3 space-y-2 animate-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Quick Switch</span>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          {ROLES.map((role) => {
            const acct = accounts[role];
            const isEditing = editingRole === role;

            if (isEditing) {
              return (
                <div key={role} className="space-y-1.5 border border-border rounded-md p-2">
                  <span className="text-xs font-medium text-foreground capitalize">{role.replace("_", " ")}</span>
                  <Input
                    placeholder="email"
                    className="h-8 text-xs"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                  <Input
                    placeholder="password"
                    type="password"
                    className="h-8 text-xs"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveAccount(role)}
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-7 text-xs flex-1" onClick={() => saveAccount(role)}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingRole(null)}>Cancel</Button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={role}
                className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-foreground capitalize block">{role.replace("_", " ")}</span>
                  {acct && <span className="text-xs text-muted-foreground truncate block">{acct.email}</span>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {acct ? (
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={switching === role}
                      onClick={() => switchTo(role)}
                    >
                      <LogIn className="h-3 w-3 mr-1" />
                      {switching === role ? "…" : "Login"}
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setEditingRole(role); setEditEmail(""); setEditPassword(""); }}>
                      Set up
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
