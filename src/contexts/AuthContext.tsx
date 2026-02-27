import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { isSuperAdminEmail } from "@/lib/super-admin";

type AppRole = "admin" | "office" | "checkin_staff" | "driver";
type PortalUserLink = {
  client_id: string;
  onboarding_completed_at: string | null;
  must_change_password: boolean;
};

interface AuthContextType {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  portalClientId: string | null;
  portalOnboardingCompletedAt: string | null;
  isPortalUser: boolean;
  isSuperAdmin: boolean;
  mustChangePassword: boolean;
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
  const [portalMustChangePassword, setPortalMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const syncTokenRef = useRef(0);
  const userIdRef = useRef<string | null>(null);

  const fetchRoles = useCallback(async (userId: string): Promise<AppRole[]> => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    return (data ?? []).map((r) => r.role as AppRole);
  }, []);

  const fetchPortalLink = useCallback(async (email: string | null | undefined): Promise<PortalUserLink | null> => {
    if (!email) return null;
    const normalizedEmail = email.toLowerCase();
    const primary = await supabase
      .from("portal_users")
      .select("client_id, onboarding_completed_at, must_change_password")
      .ilike("email", normalizedEmail)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PortalUserLink>();

    if (!primary.error) {
      return primary.data?.client_id ? primary.data : null;
    }

    const fallback = await supabase
      .from("portal_users")
      .select("client_id, onboarding_completed_at")
      .ilike("email", normalizedEmail)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ client_id: string; onboarding_completed_at: string | null }>();

    if (fallback.error || !fallback.data?.client_id) return null;
    return {
      ...fallback.data,
      must_change_password: true,
    };
  }, []);

  const syncAuthState = useCallback(async (
    nextSession: Session | null,
    options?: { silent?: boolean; skipLookup?: boolean }
  ) => {
    const syncToken = ++syncTokenRef.current;
    const nextUser = nextSession?.user ?? null;
    const nextUserId = nextUser?.id ?? null;
    const userChanged = userIdRef.current !== nextUserId;
    userIdRef.current = nextUserId;

    if (userChanged) {
      setLoading(true);
    }
    setSession(nextSession);
    setUser(nextUser);

    if (!nextUser) {
      setRoles([]);
      setPortalClientId(null);
      setPortalOnboardingCompletedAt(null);
      setPortalMustChangePassword(false);
      setLoading(false);
      return;
    }

    if (options?.skipLookup && !userChanged) {
      // Token refreshes can happen when returning to a tab. Keep the UX stable
      // and avoid full-screen loading or unnecessary role/link round-trips.
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
    setPortalMustChangePassword(Boolean(portalLink?.must_change_password));
    setLoading(false);
  }, [fetchPortalLink, fetchRoles]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, newSession) => {
        const nextUserId = newSession?.user?.id ?? null;
        const isSameUserSession = Boolean(nextUserId && nextUserId === userIdRef.current);

        if (event === "TOKEN_REFRESHED" || (event === "SIGNED_IN" && isSameUserSession)) {
          void syncAuthState(newSession, { silent: true, skipLookup: true });
          return;
        }
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
  const mustChangePassword = Boolean(user?.user_metadata?.must_change_password) || portalMustChangePassword;

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
    setPortalClientId(null);
    setPortalOnboardingCompletedAt(null);
    setPortalMustChangePassword(false);
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
        mustChangePassword,
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
