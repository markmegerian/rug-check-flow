import { addDays, subDays } from "date-fns";

export type NotificationEntityType = "estimate" | "invoice";
export type EstimateNotificationType = "estimate_reminder_24h" | "estimate_reminder_72h" | "estimate_reminder_7d";
export type InvoiceNotificationType =
  | "invoice_reminder_3d_before_due"
  | "invoice_reminder_due_date"
  | "invoice_reminder_7d_overdue"
  | "invoice_reminder_14d_overdue"
  | "invoice_weekly_statement";

export type NotificationType = EstimateNotificationType | InvoiceNotificationType;

export type NotificationCadenceRow = {
  id?: string;
  client_id: string;
  entity_type: NotificationEntityType;
  entity_id: string;
  notification_type: NotificationType;
  scheduled_for: string;
  sent_at?: string | null;
  throttle_key: string;
};

const HOUR_MS = 60 * 60 * 1000;

function toIso(date: Date) {
  return date.toISOString();
}

function computeWeeklyStatementAnchor(dueAt: Date) {
  return addDays(dueAt, 21);
}

export function buildEstimateReminderSchedule(params: {
  clientId: string;
  estimateId: string;
  sentAt: string | Date;
}): NotificationCadenceRow[] {
  const sentAt = typeof params.sentAt === "string" ? new Date(params.sentAt) : params.sentAt;
  const throttleKey = `estimate:${params.clientId}`;

  return [
    { client_id: params.clientId, entity_type: "estimate", entity_id: params.estimateId, notification_type: "estimate_reminder_24h", scheduled_for: toIso(new Date(sentAt.getTime() + 24 * HOUR_MS)), throttle_key: throttleKey },
    { client_id: params.clientId, entity_type: "estimate", entity_id: params.estimateId, notification_type: "estimate_reminder_72h", scheduled_for: toIso(new Date(sentAt.getTime() + 72 * HOUR_MS)), throttle_key: throttleKey },
    { client_id: params.clientId, entity_type: "estimate", entity_id: params.estimateId, notification_type: "estimate_reminder_7d", scheduled_for: toIso(addDays(sentAt, 7)), throttle_key: throttleKey },
  ];
}

export function buildInvoiceReminderSchedule(params: {
  clientId: string;
  invoiceId: string;
  dueAt: string | Date;
}): NotificationCadenceRow[] {
  const dueAt = typeof params.dueAt === "string" ? new Date(params.dueAt) : params.dueAt;
  const throttleKey = `collections:${params.clientId}`;

  return [
    {
      client_id: params.clientId,
      entity_type: "invoice",
      entity_id: params.invoiceId,
      notification_type: "invoice_reminder_3d_before_due",
      scheduled_for: toIso(subDays(dueAt, 3)),
      throttle_key: throttleKey,
    },
    {
      client_id: params.clientId,
      entity_type: "invoice",
      entity_id: params.invoiceId,
      notification_type: "invoice_reminder_due_date",
      scheduled_for: toIso(dueAt),
      throttle_key: throttleKey,
    },
    {
      client_id: params.clientId,
      entity_type: "invoice",
      entity_id: params.invoiceId,
      notification_type: "invoice_reminder_7d_overdue",
      scheduled_for: toIso(addDays(dueAt, 7)),
      throttle_key: throttleKey,
    },
    {
      client_id: params.clientId,
      entity_type: "invoice",
      entity_id: params.invoiceId,
      notification_type: "invoice_reminder_14d_overdue",
      scheduled_for: toIso(addDays(dueAt, 14)),
      throttle_key: throttleKey,
    },
    {
      client_id: params.clientId,
      entity_type: "invoice",
      entity_id: params.invoiceId,
      notification_type: "invoice_weekly_statement",
      scheduled_for: toIso(computeWeeklyStatementAnchor(dueAt)),
      throttle_key: throttleKey,
    },
  ];
}

export function shouldThrottleCollectionsReminder(params: {
  latestThrottleAt: string | null | undefined;
  candidateScheduledFor: string | Date;
}) {
  if (!params.latestThrottleAt) return false;
  const latest = new Date(params.latestThrottleAt).getTime();
  const candidate = typeof params.candidateScheduledFor === "string"
    ? new Date(params.candidateScheduledFor).getTime()
    : params.candidateScheduledFor.getTime();
  return candidate - latest < 72 * HOUR_MS;
}

export function describeNotificationType(type: NotificationType) {
  switch (type) {
    case "estimate_reminder_24h":
      return "Estimate reminder · 24h";
    case "estimate_reminder_72h":
      return "Estimate reminder · 72h";
    case "estimate_reminder_7d":
      return "Estimate reminder · 7d";
    case "invoice_reminder_3d_before_due":
      return "Invoice reminder · 3 days before due";
    case "invoice_reminder_due_date":
      return "Invoice reminder · due date";
    case "invoice_reminder_7d_overdue":
      return "Invoice reminder · 7 days overdue";
    case "invoice_reminder_14d_overdue":
      return "Invoice reminder · 14 days overdue";
    case "invoice_weekly_statement":
      return "Invoice reminder · weekly statement";
    default:
      return type;
  }
}
