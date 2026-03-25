import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";

export const RUG_RETURN_EVENT_TYPES = [
  "rug_immediate_return_logged",
  "rug_reentry_logged",
  "rug_return_resolved",
] as const;

export type RugReturnEventType = (typeof RUG_RETURN_EVENT_TYPES)[number];
export type RugReturnEvent = Pick<
  ExtendedTableRow<"communication_events">,
  "id" | "client_id" | "rug_id" | "event_type" | "subject" | "body" | "created_at"
>;

const rugReturnEventsKey = (rugId: string | null) => ["rug-return-events", rugId] as const;

async function fetchRugReturnEvents(rugId: string): Promise<RugReturnEvent[]> {
  const { data, error } = await supabaseExtended
    .from("communication_events")
    .select("id, client_id, rug_id, event_type, subject, body, created_at")
    .eq("rug_id", rugId)
    .in("event_type", [...RUG_RETURN_EVENT_TYPES])
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as RugReturnEvent[];
}

export function useRugReturnEvents(rugId: string | null) {
  return useQuery({
    queryKey: rugReturnEventsKey(rugId),
    queryFn: () => fetchRugReturnEvents(rugId as string),
    enabled: Boolean(rugId),
    staleTime: 30_000,
  });
}

export function useInvalidateRugReturnEvents() {
  const queryClient = useQueryClient();
  return (rugId: string | null) => queryClient.invalidateQueries({ queryKey: rugReturnEventsKey(rugId) });
}
