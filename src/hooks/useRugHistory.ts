import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HistoricalRug = {
  id: string;
  tag: string;
  description: string;
  size_length: number | null;
  size_width: number | null;
  services: string[];
  checked_in_at: string;
  status: string;
};

async function fetchSimilarRugs(
  clientId: string | null,
  rugType: string,
  length: number,
  width: number
): Promise<HistoricalRug[]> {
  if (!clientId) return [];

  const { data, error } = await supabase
    .from("rugs")
    .select("id, tag, description, size_length, size_width, services, checked_in_at, status")
    .eq("client_id", clientId)
    .order("checked_in_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  // Score rugs by similarity
  const scored = (data as HistoricalRug[]).map((rug) => {
    let score = 0;
    // Same rug type
    if (rugType && rug.description?.toLowerCase() === rugType.toLowerCase()) score += 3;
    // Similar dimensions (within 20%)
    if (rug.size_length && length > 0) {
      const lengthDiff = Math.abs(rug.size_length - length) / Math.max(rug.size_length, length);
      if (lengthDiff < 0.2) score += 2;
    }
    if (rug.size_width && width > 0) {
      const widthDiff = Math.abs(rug.size_width - width) / Math.max(rug.size_width, width);
      if (widthDiff < 0.2) score += 2;
    }
    return { rug, score };
  });

  return scored
    .filter((s) => s.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.rug);
}

export function useRugHistory(
  clientId: string | null,
  rugType: string,
  length: number,
  width: number
) {
  const enabled = Boolean(clientId) && (Boolean(rugType) || length > 0 || width > 0);

  const { data, isLoading } = useQuery({
    queryKey: ["rug-history", clientId, rugType, length, width],
    queryFn: () => fetchSimilarRugs(clientId, rugType, length, width),
    staleTime: 30_000,
    enabled,
  });

  return {
    similarRugs: data ?? [],
    loading: isLoading,
  };
}
