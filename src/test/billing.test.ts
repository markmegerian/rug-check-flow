import { describe, expect, it } from "vitest";
import {
  BILLING_REMINDER_PREFERENCES,
  COLLECTION_ACTION_META,
  COLLECTION_ACTION_TYPES,
  DEFAULT_INVOICE_TERMS_DAYS,
  calculateInvoiceDueDate,
  formatInvoiceTermsLabel,
  formatReminderPreferenceLabel,
  normalizeInvoiceTermsDays,
} from "@/lib/billing";

describe("billing helpers", () => {
  it("defaults invoice terms to 14 days", () => {
    expect(DEFAULT_INVOICE_TERMS_DAYS).toBe(14);
    expect(normalizeInvoiceTermsDays(undefined)).toBe(14);
  });

  it("clamps invoice terms into the supported range", () => {
    expect(normalizeInvoiceTermsDays(0)).toBe(1);
    expect(normalizeInvoiceTermsDays(120)).toBe(90);
  });

  it("calculates due date from issue date and terms", () => {
    expect(calculateInvoiceDueDate(new Date("2026-03-26T12:00:00.000Z"), 14)).toBe("2026-04-09");
  });

  it("formats billing labels for office surfaces", () => {
    expect(formatInvoiceTermsLabel(14)).toBe("Net 14 days");
    expect(formatInvoiceTermsLabel(1)).toBe("Net 1 day");
  });

  it("keeps reminder preferences explicit", () => {
    expect(BILLING_REMINDER_PREFERENCES).toEqual(["email", "phone", "manual"]);
  });

  it("formats reminder preferences for UI", () => {
    expect(formatReminderPreferenceLabel("email")).toBe("Email");
    expect(formatReminderPreferenceLabel("phone")).toBe("Phone");
    expect(formatReminderPreferenceLabel("manual")).toBe("Manual only");
  });

  it("keeps collections actions centralized", () => {
    expect(COLLECTION_ACTION_TYPES).toContain("collections_account_disputed");
    expect(COLLECTION_ACTION_META.collections_reminder_sent.label).toBe("Reminder sent");
  });

});
