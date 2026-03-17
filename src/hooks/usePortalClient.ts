import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type PortalClientState = {
  clientId: string | null;
  onboardingCompletedAt: string | null;
  mustChangePassword: boolean;
  loading: boolean;
  errorMessage: string | null;
};

type PortalUserLookup = {
  client_id: string;
  onboarding_completed_at: string | null;
  must_change_password: boolean;
};

export function usePortalClient() {
  const [state, setState] = useState<PortalClientState>({
    clientId: null,
    onboardingCompletedAt: null,
    mustChangePassword: false,
    loading: true,
    errorMessage: null,
  });

  const resolve = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, errorMessage: null }));

    const { data: authData } = await supabase.auth.getUser();
    const email = authData.user?.email?.toLowerCase();

    if (!email) {
      setState({
        clientId: null,
        onboardingCompletedAt: null,
        mustChangePassword: false,
        loading: false,
        errorMessage: "Portal account required. Please sign in again.",
      });
      return;
    }

    const primary = await supabase
      .from("portal_users")
      .select("client_id, onboarding_completed_at, must_change_password")
      .ilike("email", email)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PortalUserLookup>();

    let portalUser = primary.data;
    let portalError = primary.error;

    if (portalError) {
      const fallback = await supabase
        .from("portal_users")
        .select("client_id, onboarding_completed_at")
        .ilike("email", email)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ client_id: string; onboarding_completed_at: string | null }>();

      if (!fallback.error && fallback.data?.client_id) {
        portalUser = {
          ...fallback.data,
          must_change_password: Boolean(authData.user?.user_metadata?.must_change_password),
        };
        portalError = null;
      }
    }

    if (portalError || !portalUser?.client_id) {
      setState({
        clientId: null,
        onboardingCompletedAt: null,
        mustChangePassword: false,
        loading: false,
        errorMessage: portalError?.message ?? "Your email is not linked to an active client portal account.",
      });
      return;
    }

    setState({
      clientId: portalUser.client_id,
      onboardingCompletedAt: portalUser.onboarding_completed_at,
      mustChangePassword: Boolean(portalUser.must_change_password),
      loading: false,
      errorMessage: null,
    });
  }, []);

  const markOnboardingComplete = useCallback(async () => {
    const { data, error } = await supabase.rpc("mark_portal_onboarding_complete" as any);
    if (error || !data) {
      return false;
    }
    await resolve();
    return true;
  }, [resolve]);

  const markPasswordChangeComplete = useCallback(async () => {
    const { data, error } = await supabase.rpc("mark_portal_password_changed" as any);

    if (error) {
      const missingRpc = error.message.toLowerCase().includes("mark_portal_password_changed")
        || error.message.toLowerCase().includes("could not find the function");
      if (!missingRpc) {
        return false;
      }
      await resolve();
      return true;
    }

    if (!data) {
      return false;
    }

    await resolve();
    return true;
  }, [resolve]);

  useEffect(() => {
    resolve();
  }, [resolve]);

  return {
    ...state,
    refresh: resolve,
    markOnboardingComplete,
    markPasswordChangeComplete,
  };
}
