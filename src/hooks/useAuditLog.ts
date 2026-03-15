import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type AuditEntry = Tables<"audit_log">;

const AUDIT_LOG_KEY = ["auditLog"] as const;
const PAGE_SIZE = 100;

async function fetchAuditLogPage(pageParam: number): Promise<AuditEntry[]> {
  const from = pageParam * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error } = await supabase
    .from("audit_log")
    .select("id, created_at, user_name, action, user_id")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return (data ?? []) as AuditEntry[];
}

export function useAuditLog() {
  return useInfiniteQuery({
    queryKey: [...AUDIT_LOG_KEY],
    queryFn: ({ pageParam }) => fetchAuditLogPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length === PAGE_SIZE ? lastPageParam + 1 : undefined,
    staleTime: 15_000,
  });
}

export function useInvalidateAuditLog() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: AUDIT_LOG_KEY });
}
