import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type PortalClientState = {
  clientId: string | null;
  onboardingCompletedAt: string | null;
  loading: boolean;
  errorMessage: string | null;
};

type PortalUserLookup = {
  client_id: string;
  onboarding_completed_at: string | null;
};

export function usePortalClient() {
  const [state, setState] = useState<PortalClientState>({
    clientId: null,
    onboardingCompletedAt: null,
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
        loading: false,
        errorMessage: "Portal account required. Please sign in again.",
      });
      return;
    }

    const { data: portalUser, error: portalError } = await supabase
      .from("portal_users")
      .select("client_id, onboarding_completed_at")
      .ilike("email", email)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<PortalUserLookup>();

    if (portalError || !portalUser?.client_id) {
      setState({
        clientId: null,
        onboardingCompletedAt: null,
        loading: false,
        errorMessage: portalError?.message ?? "Your email is not linked to an active client portal account.",
      });
      return;
    }

    setState({
      clientId: portalUser.client_id,
      onboardingCompletedAt: portalUser.onboarding_completed_at,
      loading: false,
      errorMessage: null,
    });
  }, []);

  const markOnboardingComplete = useCallback(async () => {
    const { data, error } = await supabase.rpc("mark_portal_onboarding_complete");
    if (error || !data) {
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
  };
}
