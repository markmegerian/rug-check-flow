import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type ThreadType = Tables<"message_threads">["thread_type"];

type OpenOrCreateThreadArgs = {
  clientId: string;
  threadType: ThreadType;
  entityId?: string | null;
};

export async function openOrCreateThread({ clientId, threadType, entityId }: OpenOrCreateThreadArgs) {
  let query = supabase
    .from("message_threads")
    .select("id")
    .eq("client_id", clientId)
    .eq("thread_type", threadType)
    .eq("status", "active")
    .limit(1);

  query = entityId ? query.eq("entity_id", entityId) : query.is("entity_id", null);

  const { data: existing, error: existingError } = await query.maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("message_threads")
    .insert({
      client_id: clientId,
      thread_type: threadType,
      entity_id: entityId ?? null,
      status: "active",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}
