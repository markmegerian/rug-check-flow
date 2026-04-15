import { addDays, subDays } from "date-fns";

export type NotificationEntityType = "estimate" | "invoice";
export type EstimateNotificationType = "estimate_batch_send" | "estimate_reminder_24h" | "estimate_reminder_72h" | "estimate_reminder_7d";
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

function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function zonedTimeToUtc(params: { year: number; month: number; day: number; hour: number; minute?: number; second?: number; timeZone: string }) {
  let guess = Date.UTC(params.year, params.month - 1, params.day, params.hour, params.minute ?? 0, params.second ?? 0);

  for (let i = 0; i < 5; i += 1) {
    const actual = getTimeZoneParts(new Date(guess), params.timeZone);
    const desiredUtc = Date.UTC(params.year, params.month - 1, params.day, params.hour, params.minute ?? 0, params.second ?? 0);
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const diff = desiredUtc - actualUtc;
    guess += diff;
    if (diff === 0) break;
  }

  return new Date(guess);
}

export function computeNextDailyAnchorInEastern(hour = 15, minute = 0, now = new Date()) {
  const easternNow = getTimeZoneParts(now, "America/New_York");
  let target = zonedTimeToUtc({
    year: easternNow.year,
    month: easternNow.month,
    day: easternNow.day,
    hour,
    minute,
    second: 0,
    timeZone: "America/New_York",
  });

  if (target.getTime() <= now.getTime()) {
    const nextDayNoonUtc = zonedTimeToUtc({
      year: easternNow.year,
      month: easternNow.month,
      day: easternNow.day,
      hour: 12,
      minute: 0,
      second: 0,
      timeZone: "America/New_York",
    });
    const nextEasternDay = getTimeZoneParts(addDays(nextDayNoonUtc, 1), "America/New_York");
    target = zonedTimeToUtc({
      year: nextEasternDay.year,
      month: nextEasternDay.month,
      day: nextEasternDay.day,
      hour,
      minute,
      second: 0,
      timeZone: "America/New_York",
    });
  }

  return target;
}

export function buildEstimateBatchSendSchedule(params: {
  clientId: string;
  estimateId: string;
  queuedAt?: string | Date;
}): NotificationCadenceRow[] {
  const queuedAt = typeof params.queuedAt === "string" ? new Date(params.queuedAt) : params.queuedAt ?? new Date();
  return [{
    client_id: params.clientId,
    entity_type: "estimate",
    entity_id: params.estimateId,
    notification_type: "estimate_batch_send",
    scheduled_for: toIso(computeNextDailyAnchorInEastern(15, 0, queuedAt)),
    throttle_key: `estimate-batch:${params.clientId}`,
  }];
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
    case "estimate_batch_send":
      return "Estimate queued · 3:00 PM ET batch";
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
