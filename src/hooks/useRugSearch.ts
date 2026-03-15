import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RugSearchResult {
  id: string;
  tag: string;
  description: string;
  status: string;
  size_length: number | null;
  size_width: number | null;
  client_name: string | null;
}

export function useRugSearch(query: string) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: ["rugSearch", trimmed],
    queryFn: async (): Promise<RugSearchResult[]> => {
      const pattern = `%${trimmed}%`;
      const { data, error } = await supabase
        .from("rugs")
        .select("id, tag, description, status, size_length, size_width, clients(name)")
        .or(`tag.ilike.${pattern},description.ilike.${pattern}`)
        .order("checked_in_at", { ascending: false })
        .limit(20);

      if (error) throw error;

      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        tag: r.tag as string,
        description: (r.description as string) ?? "",
        status: r.status as string,
        size_length: r.size_length as number | null,
        size_width: r.size_width as number | null,
        client_name: (r.clients as { name: string } | null)?.name ?? null,
      }));
    },
    enabled: trimmed.length >= 2,
    staleTime: 10_000,
  });
}
