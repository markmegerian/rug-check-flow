import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { ProductionStage } from "@/data/production";

export type RugRow = Tables<"rugs">;
export type RugServiceRow = Pick<
  Tables<"rug_services">,
  "rug_id" | "service_id" | "unit_price" | "line_total" | "service_name" | "edges"
>;

export interface RugWithServices {
  id: string;
  tag: string;
  description: string;
  status: ProductionStage;
  size_length: number | null;
  size_width: number | null;
  checked_in_at: string;
  notes: string;
  client_id: string | null;
  client_name: string | null;
  photo_url: string | null;
  services: { name: string; line_total: number; edges?: string[] }[];
}

const RUGS_KEY = ["rugs"] as const;

async function fetchRugsWithServices(): Promise<RugWithServices[]> {
  const { data, error } = await supabase
    .from("rugs")
    .select("id, tag, description, status, size_length, size_width, checked_in_at, notes, client_id, photo_url, clients(name)")
    .order("checked_in_at", { ascending: false });

  if (error) throw error;

  const rugRows = (data ?? []) as unknown as (Pick<
    Tables<"rugs">,
    "id" | "tag" | "description" | "status" | "size_length" | "size_width" | "checked_in_at" | "notes" | "client_id" | "photo_url"
  > & { clients: { name: string } | null })[];

  const rugIds = rugRows.map((r) => r.id);
  if (rugIds.length === 0) return [];

  const { data: serviceData } = await supabase
    .from("rug_services")
    .select("rug_id, line_total, service_name, edges")
    .in("rug_id", rugIds);

  const serviceMap = new Map<string, { name: string; line_total: number; edges?: string[] }[]>();
  for (const row of (serviceData ?? []) as RugServiceRow[]) {
    const list = serviceMap.get(row.rug_id) ?? [];
    list.push({
      name: row.service_name || "Unknown",
      line_total: Number(row.line_total),
      edges: row.edges ?? [],
    });
    serviceMap.set(row.rug_id, list);
  }

  return rugRows.map((rug) => ({
    id: rug.id,
    tag: rug.tag,
    description: rug.description,
    status: rug.status as ProductionStage,
    size_length: rug.size_length,
    size_width: rug.size_width,
    checked_in_at: rug.checked_in_at,
    notes: rug.notes,
    client_id: rug.client_id,
    client_name: rug.clients?.name ?? null,
    photo_url: rug.photo_url,
    services: serviceMap.get(rug.id) ?? [],
  }));
}

export function useRugs() {
  return useQuery({
    queryKey: RUGS_KEY,
    queryFn: fetchRugsWithServices,
    staleTime: 15_000,
  });
}

/** Rug counts grouped by client_id */
export function useRugCountsByClient() {
  return useQuery({
    queryKey: ["rugs", "countsByClient"],
    queryFn: async () => {
      const { data } = await supabase.from("rugs").select("client_id");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r) => {
        if (r.client_id) counts[r.client_id] = (counts[r.client_id] || 0) + 1;
      });
      return counts;
    },
    staleTime: 30_000,
  });
}

export function useInvalidateRugs() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: RUGS_KEY });
}
