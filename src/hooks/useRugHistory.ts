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
  clientId: string,
  rugType: string,
  length: number,
  width: number
): Promise<HistoricalRug[]> {
  const { data, error } = await supabase
    .from("rugs")
    .select("id, tag, description, size_length, size_width, services, checked_in_at, status")
    .eq("client_id", clientId)
    .order("checked_in_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];

  const scored = (data as HistoricalRug[]).map((rug) => {
    let score = 0;

    // Same rug type (case-insensitive)
    if (rugType && rug.description && rug.description.toLowerCase() === rugType.toLowerCase()) {
      score += 3;
    }

    // Similar dimensions (within 20%) — guard against division by zero
    const rugL = rug.size_length ?? 0;
    const rugW = rug.size_width ?? 0;

    if (rugL > 0 && length > 0) {
      const maxL = Math.max(rugL, length);
      const lengthDiff = Math.abs(rugL - length) / maxL;
      if (lengthDiff < 0.2) score += 2;
    }

    if (rugW > 0 && width > 0) {
      const maxW = Math.max(rugW, width);
      const widthDiff = Math.abs(rugW - width) / maxW;
      if (widthDiff < 0.2) score += 2;
    }

    return { rug, score };
  });

  return scored
    .filter((s) => s.score >= 3)
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
  const enabled = Boolean(clientId) && Boolean(rugType.trim()) && length > 0 && width > 0;

  const { data, isLoading } = useQuery({
    queryKey: ["rug-history", clientId, rugType, Math.round(length), Math.round(width)],
    queryFn: () => fetchSimilarRugs(clientId!, rugType, length, width),
    staleTime: 60_000,
    enabled,
  });

  return {
    similarRugs: data ?? [],
    loading: isLoading,
  };
}
