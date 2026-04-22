import { supabaseExtended } from "@/integrations/supabase/extended";

export type ProductionBoardRow = {
  id: string;
  tag: string;
  description: string;
  status: string;
  size_length: number | null;
  size_width: number | null;
  checked_in_at: string;
  notes: string;
  client_id: string | null;
  client_name: string | null;
  photo_url: string | null;
  services: { name: string; line_total: number; edges?: string[]; approval_status: string }[];
  delivery_target_date: string | null;
  delivery_status: string | null;
};

export async function fetchProductionBoardSnapshot(): Promise<ProductionBoardRow[]> {
  const { data, error } = await supabaseExtended.rpc("get_production_board_snapshot", {});

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    tag: row.tag,
    description: row.description ?? "",
    status: row.status,
    size_length: row.size_length ?? null,
    size_width: row.size_width ?? null,
    checked_in_at: row.checked_in_at,
    notes: row.notes ?? "",
    client_id: row.client_id ?? null,
    client_name: row.client_name ?? null,
    photo_url: row.photo_url ?? null,
    services: (row.services ?? []).map((service) => ({
      name: service.name,
      line_total: Number(service.line_total ?? 0),
      edges: service.edges ?? [],
      approval_status: service.approval_status ?? "approved",
    })),
    delivery_target_date: row.delivery_target_date ?? null,
    delivery_status: row.delivery_status ?? null,
  }));
}
