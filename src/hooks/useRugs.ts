import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { fetchRugServicesByRugId, fetchRugServicesForRugIds } from "@/lib/rug-service-approval";
export type RugRow = Tables<"rugs">;
export type RugServiceRow = Pick<
  Tables<"rug_services">,
  "rug_id" | "service_id" | "unit_price" | "line_total" | "service_name" | "edges" | "approval_status"
>;

export interface RugWithServices {
  id: string;
  tag: string;
  description: string;
  status: string;
  size_length: number | null;
  size_width: number | null;
  checked_in_at: string;
  completed_at?: string | null;
  picked_up_at?: string | null;
  notes: string;
  client_id: string | null;
  client_name: string | null;
  photo_url: string | null;
  services: { name: string; line_total: number; edges?: string[]; approval_status: string }[];
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

  const { data: serviceData, error: serviceError } = await fetchRugServicesForRugIds(rugIds);
  if (serviceError) throw serviceError;

  const serviceMap = new Map<string, { name: string; line_total: number; edges?: string[]; approval_status: string }[]>();
  for (const row of (serviceData ?? []) as RugServiceRow[]) {
    const list = serviceMap.get(row.rug_id) ?? [];
    list.push({
      name: row.service_name || "Unknown",
      line_total: Number(row.line_total),
      edges: row.edges ?? [],
      approval_status: row.approval_status ?? "approved",
    });
    serviceMap.set(row.rug_id, list);
  }

  return rugRows.map((rug) => ({
    id: rug.id,
    tag: rug.tag,
    description: rug.description,
    status: rug.status,
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
    staleTime: 30_000,
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

      const { data: serviceData, error: serviceError } = await fetchRugServicesByRugId(id);
      if (serviceError) throw serviceError;

      const services = ((serviceData ?? []) as RugServiceRow[]).map((s) => ({
        name: s.service_name || "Unknown",
        line_total: Number(s.line_total),
        edges: s.edges ?? [],
        approval_status: s.approval_status ?? "approved",
      }));

      return {
        id: row.id,
        tag: row.tag,
        description: row.description,
        status: row.status,
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
      };
    },
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

export function useInvalidateRugs() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: RUGS_KEY });
}
