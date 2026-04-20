import { supabaseExtended } from "@/integrations/supabase/extended";
import type { Tables } from "@/integrations/supabase/types";

type ClientSummary = Pick<Tables<"clients">, "id" | "name" | "contact_name" | "email">;
type MessageThread = Tables<"message_threads">;

type ThreadSummaryRow = Pick<
  MessageThread,
  "id" | "client_id" | "entity_id" | "thread_type" | "status" | "created_at" | "updated_at"
> & {
  client: ClientSummary | null;
  entity_label: string | null;
  last_message_at: string | null;
  last_message_body: string | null;
  last_message_sender: string | null;
  message_count: number;
  visible_message_count: number;
  unread: boolean;
};

export type ThreadSummary = Pick<
  MessageThread,
  "id" | "client_id" | "entity_id" | "thread_type" | "status" | "created_at" | "updated_at"
> & {
  client: ClientSummary | null;
  entityLabel: string | null;
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  lastMessageSender: string | null;
  messageCount: number;
  visibleMessageCount: number;
  unread: boolean;
};

export async function fetchThreadSummaries(clientId?: string | null): Promise<ThreadSummary[]> {
  const { data, error } = await supabaseExtended.rpc("get_thread_summaries", {
    p_client_id: clientId ?? null,
  });

  if (error) throw error;

  return ((data ?? []) as ThreadSummaryRow[]).map((row) => ({
    id: row.id,
    client_id: row.client_id,
    entity_id: row.entity_id,
    thread_type: row.thread_type,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    client: row.client,
    entityLabel: row.entity_label,
    lastMessageAt: row.last_message_at,
    lastMessageBody: row.last_message_body,
    lastMessageSender: row.last_message_sender,
    messageCount: row.message_count,
    visibleMessageCount: row.visible_message_count,
    unread: row.unread,
  }));
}
