import { supabase } from "@/integrations/supabase/client";
import {
  buildEstimateBatchSendSchedule,
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
  const payload = normalized.map((row) => ({
    client_id: row.client_id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    notification_type: row.notification_type,
    scheduled_for: row.scheduled_for,
    throttle_key: row.throttle_key,
  }));

  const { error } = await supabase
    .from("notification_cadence")
    .upsert(payload, { onConflict: "client_id,entity_type,entity_id,notification_type" });

  if (error) throw error;
}

export async function queueEstimateForBatchSend(params: {
  clientId: string;
  estimateId: string;
  queuedAt?: string;
}) {
  const rows = buildEstimateBatchSendSchedule({
    clientId: params.clientId,
    estimateId: params.estimateId,
    queuedAt: params.queuedAt,
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
