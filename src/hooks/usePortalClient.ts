import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type PortalClientState = {
  clientId: string | null;
  loading: boolean;
  errorMessage: string | null;
};

export function usePortalClient() {
  const [state, setState] = useState<PortalClientState>({
    clientId: null,
    loading: true,
    errorMessage: null,
  });

  const resolve = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, errorMessage: null }));

    const { data: authData } = await supabase.auth.getUser();
    const email = authData.user?.email?.toLowerCase();

    if (!email) {
      setState({ clientId: null, loading: false, errorMessage: "Portal account required. Please sign in again." });
      return;
    }

    const { data: portalUser, error: portalError } = await supabase
      .from("portal_users")
      .select("client_id")
      .eq("email", email)
      .eq("status", "active")
      .maybeSingle();

    if (portalError || !portalUser?.client_id) {
      setState({
        clientId: null,
        loading: false,
        errorMessage: portalError?.message ?? "Your email is not linked to an active client portal account.",
      });
      return;
    }

    setState({ clientId: portalUser.client_id, loading: false, errorMessage: null });
  }, []);

  useEffect(() => {
    resolve();
  }, [resolve]);

  return {
    ...state,
    refresh: resolve,
  };
}
