import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  completed_at?: string | null;
  picked_up_at?: string | null;
  notes: string;
  client_id: string | null;
  client_name: string | null;
  photo_url: string | null;
  services: { name: string; line_total: number; edges?: string[] }[];
  servicesCompletedCount: number;
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
    .select("rug_id, line_total, service_name, edges, completed_at")
    .in("rug_id", rugIds);

  const serviceMap = new Map<string, { name: string; line_total: number; edges?: string[] }[]>();
  const completedCountMap = new Map<string, number>();
  for (const row of (serviceData ?? []) as (RugServiceRow & { completed_at: string | null })[]) {
    const list = serviceMap.get(row.rug_id) ?? [];
    list.push({
      name: row.service_name || "Unknown",
      line_total: Number(row.line_total),
      edges: row.edges ?? [],
    });
    serviceMap.set(row.rug_id, list);
    if (row.completed_at) {
      completedCountMap.set(row.rug_id, (completedCountMap.get(row.rug_id) ?? 0) + 1);
    }
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
    servicesCompletedCount: completedCountMap.get(rug.id) ?? 0,
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

/** Single rug detail query */
export function useRug(id: string | null) {
  return useQuery({
    queryKey: [...RUGS_KEY, "detail", id],
    queryFn: async (): Promise<RugWithServices | null> => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("rugs")
        .select("id, tag, description, status, size_length, size_width, checked_in_at, completed_at, picked_up_at, notes, client_id, photo_url, clients(name)")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as unknown as Pick<
        Tables<"rugs">,
        "id" | "tag" | "description" | "status" | "size_length" | "size_width" | "checked_in_at" | "completed_at" | "picked_up_at" | "notes" | "client_id" | "photo_url"
      > & { clients: { name: string } | null };

      const { data: serviceData } = await supabase
        .from("rug_services")
        .select("rug_id, line_total, service_name, edges, completed_at")
        .eq("rug_id", id);

      const serviceRows = (serviceData ?? []) as (RugServiceRow & { completed_at: string | null })[];
      const services = serviceRows.map((s) => ({
        name: s.service_name || "Unknown",
        line_total: Number(s.line_total),
        edges: s.edges ?? [],
      }));
      const servicesCompletedCount = serviceRows.filter((s) => s.completed_at !== null).length;

      return {
        id: row.id,
        tag: row.tag,
        description: row.description,
        status: row.status as ProductionStage,
        size_length: row.size_length,
        size_width: row.size_width,
        checked_in_at: row.checked_in_at,
        completed_at: (row as Record<string, unknown>).completed_at as string | null,
        picked_up_at: (row as Record<string, unknown>).picked_up_at as string | null,
        notes: row.notes,
        client_id: row.client_id,
        client_name: row.clients?.name ?? null,
        photo_url: row.photo_url,
        services,
        servicesCompletedCount,
      };
    },
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

/** Update rug notes mutation */
export function useUpdateRugNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase.from("rugs").update({ notes }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: RUGS_KEY });
    },
  });
}

export function useInvalidateRugs() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: RUGS_KEY });
}
