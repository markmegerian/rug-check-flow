import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Client = Tables<"clients">;

const CLIENTS_KEY = ["clients"] as const;

async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export function useClients() {
  return useQuery({
    queryKey: CLIENTS_KEY,
    queryFn: fetchClients,
    staleTime: 30_000,
  });
}

/** Lightweight lookup for selectors and lightweight billing/profile flows */
export function useClientNames() {
  return useQuery({
    queryKey: ["clients", "names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, contact_name, email, pricing_tier, invoice_terms_days, billing_reminder_preference")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useInvalidateClients() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: CLIENTS_KEY }),
    queryClient.invalidateQueries({ queryKey: ["clients", "names"] }),
  ]);
}
