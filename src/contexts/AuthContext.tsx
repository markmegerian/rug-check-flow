import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { isSuperAdminEmail } from "@/lib/super-admin";

type AppRole = "admin" | "office" | "checkin_staff" | "driver";
type PortalUserLink = {
  client_id: string;
  onboarding_completed_at: string | null;
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  portalClientId: string | null;
  portalOnboardingCompletedAt: string | null;
  isPortalUser: boolean;
  isSuperAdmin: boolean;
  loading: boolean;
  hasRole: (role: AppRole) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [portalClientId, setPortalClientId] = useState<string | null>(null);
  const [portalOnboardingCompletedAt, setPortalOnboardingCompletedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const syncTokenRef = useRef(0);

  const fetchRoles = useCallback(async (userId: string): Promise<AppRole[]> => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const normalized: AppRole[] = [];
    for (const row of data ?? []) {
      const rawRole = (row as { role?: unknown }).role;
      if (rawRole === "admin" || rawRole === "office" || rawRole === "checkin_staff" || rawRole === "driver") {
        normalized.push(rawRole);
        continue;
      }

      // Legacy role value in the DB - treat it as check-in staff for internal access.
      if (rawRole === "staff") {
        normalized.push("checkin_staff");
      }
    }

    return [...new Set(normalized)];
  }, []);

  const fetchPortalLink = useCallback(async (email: string | null | undefined): Promise<PortalUserLink | null> => {
    if (!email) return null;
    const normalizedEmail = email.toLowerCase();
    const { data, error } = await supabase
      .from("portal_users")
      .select("client_id, onboarding_completed_at")
      .ilike("email", normalizedEmail)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PortalUserLink>();
    if (error) return null;
    return data?.client_id ? data : null;
  }, []);

  const syncAuthState = useCallback(async (nextSession: Session | null) => {
    const syncToken = ++syncTokenRef.current;
    setLoading(true);
    setSession(nextSession);
    const nextUser = nextSession?.user ?? null;
    setUser(nextUser);

    if (!nextUser) {
      setRoles([]);
      setPortalClientId(null);
      setPortalOnboardingCompletedAt(null);
      setLoading(false);
      return;
    }

    const [nextRoles, portalLink] = await Promise.all([
      fetchRoles(nextUser.id),
      fetchPortalLink(nextUser.email),
    ]);

    if (syncTokenRef.current !== syncToken) return;

    // Portal-linked logins are client-only accounts and should not land in internal workspaces
    // even if legacy role rows exist.
    const nextIsSuperAdmin = isSuperAdminEmail(nextUser.email);
    const effectiveRoles = portalLink?.client_id && !nextIsSuperAdmin ? [] : nextRoles;

    setRoles(effectiveRoles);
    setPortalClientId(portalLink?.client_id ?? null);
    setPortalOnboardingCompletedAt(portalLink?.onboarding_completed_at ?? null);
    setLoading(false);
  }, [fetchPortalLink, fetchRoles]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        void syncAuthState(newSession);
      }
    );

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      void syncAuthState(s);
    });

    return () => subscription.unsubscribe();
  }, [syncAuthState]);

  const hasRole = (role: AppRole) => roles.includes(role);
  const isPortalUser = Boolean(portalClientId);
  const isSuperAdmin = isSuperAdminEmail(user?.email);

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
    setPortalClientId(null);
    setPortalOnboardingCompletedAt(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        roles,
        portalClientId,
        portalOnboardingCompletedAt,
        isPortalUser,
        isSuperAdmin,
        loading,
        hasRole,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
