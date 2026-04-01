import { supabase } from "@/integrations/supabase/client";
import {
  buildEstimateReminderSchedule,
  buildInvoiceReminderSchedule,
  type NotificationCadenceRow,
} from "@/lib/notification-cadence";

function uniqueByEntityAndType(rows: NotificationCadenceRow[]) {
  const map = new Map<string, NotificationCadenceRow>();
  for (const row of rows) {
    map.set(`${row.entity_type}:${row.entity_id}:${row.notification_type}`, row);
  }
  return Array.from(map.values());
}

async function upsertCadenceRows(rows: NotificationCadenceRow[]) {
  const normalized = uniqueByEntityAndType(rows);
  for (const row of normalized) {
    const { data: existing, error: lookupError } = await supabase
      .from("notification_cadence")
      .select("id, sent_at")
      .eq("client_id", row.client_id)
      .eq("entity_type", row.entity_type)
      .eq("entity_id", row.entity_id)
      .eq("notification_type", row.notification_type)
      .limit(1)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (existing?.id) {
      if (!existing.sent_at) {
        const { error: updateError } = await supabase
          .from("notification_cadence")
          .update({ scheduled_for: row.scheduled_for, throttle_key: row.throttle_key })
          .eq("id", existing.id);
        if (updateError) throw updateError;
      }
      continue;
    }

    const { error: insertError } = await supabase.from("notification_cadence").insert({
      client_id: row.client_id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      notification_type: row.notification_type,
      scheduled_for: row.scheduled_for,
      throttle_key: row.throttle_key,
    });

    if (insertError) throw insertError;
  }
}

export async function seedEstimateReminderCadence(params: {
  clientId: string;
  estimateId: string;
  sentAt: string;
}) {
  const rows = buildEstimateReminderSchedule({
    clientId: params.clientId,
    estimateId: params.estimateId,
    sentAt: params.sentAt,
  });
  await upsertCadenceRows(rows);
}

export async function seedInvoiceReminderCadence(params: {
  clientId: string;
  invoiceId: string;
  dueAt: string;
}) {
  const rows = buildInvoiceReminderSchedule({
    clientId: params.clientId,
    invoiceId: params.invoiceId,
    dueAt: params.dueAt,
  });
  await upsertCadenceRows(rows);
}
