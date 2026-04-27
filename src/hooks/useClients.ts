import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Client = Tables<"clients">;

export type ClientsPage = {
  rows: Client[];
  total: number;
};

export type ClientsPageParams = {
  page: number;
  pageSize: number;
  search?: string;
  routeDay?: string;
  sortColumn?: "name" | "contact_name" | "phone" | "route_day" | "pricing_tier" | "created_at";
  sortDirection?: "asc" | "desc";
};

const CLIENTS_KEY = ["clients"] as const;

async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

async function fetchClientsPage({
  page,
  pageSize,
  search,
  routeDay,
  sortColumn = "name",
  sortDirection = "asc",
}: ClientsPageParams): Promise<ClientsPage> {
  let query = supabase
    .from("clients")
    .select("*", { count: "exact" })
    .order(sortColumn, { ascending: sortDirection === "asc", nullsFirst: sortDirection === "asc" })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (routeDay === "unassigned") {
    query = query.is("route_day", null);
  } else if (routeDay) {
    query = query.eq("route_day", routeDay);
  }

  const q = search?.trim();
  if (q) {
    const pattern = `%${q}%`;
    query = query.or([
      `name.ilike.${pattern}`,
      `contact_name.ilike.${pattern}`,
      `phone.ilike.${pattern}`,
      `email.ilike.${pattern}`,
    ].join(","));
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export function useClients() {
  return useQuery({
    queryKey: CLIENTS_KEY,
    queryFn: fetchClients,
    staleTime: 30_000,
  });
}

export function useClientsPage(params: ClientsPageParams) {
  return useQuery({
    queryKey: ["clients", "page", params],
    queryFn: () => fetchClientsPage(params),
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
