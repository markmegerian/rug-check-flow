import { addDays, format } from "date-fns";

export const DEFAULT_INVOICE_TERMS_DAYS = 14;
export const BILLING_REMINDER_PREFERENCES = ["email", "phone", "manual"] as const;

export type BillingReminderPreference = (typeof BILLING_REMINDER_PREFERENCES)[number];

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
