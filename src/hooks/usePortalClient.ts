import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PortalUserRow = {
  client_id: string;
};

export function usePortalClient() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolveClient = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const email = authData.user?.email?.toLowerCase();

    if (authError || !email) {
      setClientId(null);
      setError("Portal account required. Please sign in again.");
      setLoading(false);
      return;
    }

    const { data: portalUser, error: portalError } = await supabase
      .from("portal_users")
      .select("client_id")
      .eq("email", email)
      .eq("status", "active")
      .maybeSingle<PortalUserRow>();

    if (portalError || !portalUser?.client_id) {
      setClientId(null);
      setError("Your account is not linked to an active client portal user.");
      setLoading(false);
      return;
    }

    setClientId(portalUser.client_id);
    setLoading(false);
  }, []);

  useEffect(() => {
    resolveClient();
  }, [resolveClient]);

  return { clientId, loading, error, refetch: resolveClient };
}
