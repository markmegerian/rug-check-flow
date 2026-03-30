import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type MessageThread = Tables<"message_threads">;

type ThreadEntityLabelMap = Record<string, string>;

export async function fetchThreadEntityLabels(
  threads: Pick<MessageThread, "id" | "thread_type" | "entity_id">[],
): Promise<ThreadEntityLabelMap> {
  const estimateIds = Array.from(
    new Set(
      threads
        .filter((thread) => thread.thread_type === "estimate" && Boolean(thread.entity_id))
        .map((thread) => thread.entity_id as string),
    ),
  );

  const invoiceIds = Array.from(
    new Set(
      threads
        .filter((thread) => thread.thread_type === "invoice" && Boolean(thread.entity_id))
        .map((thread) => thread.entity_id as string),
    ),
  );

  const labels: ThreadEntityLabelMap = {};

  if (estimateIds.length > 0) {
    const { data, error } = await supabase
      .from("estimates")
      .select("id, estimate_number")
      .in("id", estimateIds);

    if (!error) {
      for (const row of data ?? []) {
        labels[row.id] = row.estimate_number;
      }
    }
  }

  if (invoiceIds.length > 0) {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .in("id", invoiceIds);

    if (!error) {
      for (const row of data ?? []) {
        labels[row.id] = row.invoice_number;
      }
    }
  }

  return labels;
}

export function getThreadEntityDisplayLabel(
  thread: Pick<MessageThread, "thread_type" | "entity_id">,
  labels: ThreadEntityLabelMap,
) {
  if (!thread.entity_id) return null;
  return labels[thread.entity_id] ?? thread.entity_id;
}
