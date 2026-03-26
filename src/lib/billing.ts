import { addDays, format } from "date-fns";

export const DEFAULT_INVOICE_TERMS_DAYS = 14;
export const BILLING_REMINDER_PREFERENCES = ["email", "phone", "manual"] as const;
export const COLLECTION_ACTION_TYPES = [
  "collections_reminder_sent",
  "collections_account_handled",
  "collections_account_on_hold",
  "collections_account_disputed",
] as const;

export type BillingReminderPreference = (typeof BILLING_REMINDER_PREFERENCES)[number];
export type CollectionsActionType = (typeof COLLECTION_ACTION_TYPES)[number];

export const COLLECTION_ACTION_META: Record<CollectionsActionType, { label: string; description: string; channel: "email" | "in_app_chat" }> = {
  collections_reminder_sent: {
    label: "Reminder sent",
    description: "Log that collections follow-up went out to this client account.",
    channel: "email",
  },
  collections_account_handled: {
    label: "Marked handled",
    description: "Log that this account has an owner and a current follow-up plan.",
    channel: "in_app_chat",
  },
  collections_account_on_hold: {
    label: "Placed on hold",
    description: "Log that the account is intentionally paused from normal collections follow-up.",
    channel: "in_app_chat",
  },
  collections_account_disputed: {
    label: "Marked disputed",
    description: "Log that the overdue balance is under review or being challenged.",
    channel: "in_app_chat",
  },
};

export function normalizeInvoiceTermsDays(value: number | null | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_INVOICE_TERMS_DAYS;
  return Math.min(90, Math.max(1, Math.trunc(value as number)));
}

export function calculateInvoiceDueDate(issueDate: Date, invoiceTermsDays: number | null | undefined) {
  return format(addDays(issueDate, normalizeInvoiceTermsDays(invoiceTermsDays)), "yyyy-MM-dd");
}

export function formatInvoiceTermsLabel(invoiceTermsDays: number | null | undefined) {
  const normalized = normalizeInvoiceTermsDays(invoiceTermsDays);
  return normalized === 1 ? "Net 1 day" : `Net ${normalized} days`;
}

export function formatReminderPreferenceLabel(preference: BillingReminderPreference | string | null | undefined) {
  if (preference === "phone") return "Phone";
  if (preference === "manual") return "Manual only";
  return "Email";
}
