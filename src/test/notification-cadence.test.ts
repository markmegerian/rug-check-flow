import { describe, expect, it } from "vitest";
import {
  buildEstimateReminderSchedule,
  buildInvoiceReminderSchedule,
  describeNotificationType,
  shouldThrottleCollectionsReminder,
} from "@/lib/notification-cadence";

describe("notification cadence", () => {
  it("builds estimate cadence at 24h, 72h, and 7d", () => {
    const rows = buildEstimateReminderSchedule({
      clientId: "client-1",
      estimateId: "estimate-1",
      sentAt: "2026-04-01T12:00:00.000Z",
    });

    expect(rows.map((row) => row.notification_type)).toEqual([
      "estimate_reminder_24h",
      "estimate_reminder_72h",
      "estimate_reminder_7d",
    ]);
    expect(rows[0].scheduled_for).toBe("2026-04-02T12:00:00.000Z");
    expect(rows[1].scheduled_for).toBe("2026-04-04T12:00:00.000Z");
    expect(rows[2].scheduled_for).toBe("2026-04-08T12:00:00.000Z");
  });

  it("builds invoice cadence from due date through weekly statement", () => {
    const rows = buildInvoiceReminderSchedule({
      clientId: "client-1",
      invoiceId: "invoice-1",
      dueAt: "2026-04-10T00:00:00.000Z",
    });

    expect(rows.map((row) => row.notification_type)).toEqual([
      "invoice_reminder_3d_before_due",
      "invoice_reminder_due_date",
      "invoice_reminder_7d_overdue",
      "invoice_reminder_14d_overdue",
      "invoice_weekly_statement",
    ]);
    expect(rows[0].scheduled_for).toBe("2026-04-07T00:00:00.000Z");
    expect(rows[4].scheduled_for).toBe("2026-05-01T00:00:00.000Z");
  });

  it("enforces 72h collections throttle windows", () => {
    expect(shouldThrottleCollectionsReminder({
      latestThrottleAt: "2026-04-10T00:00:00.000Z",
      candidateScheduledFor: "2026-04-12T23:59:59.000Z",
    })).toBe(true);

    expect(shouldThrottleCollectionsReminder({
      latestThrottleAt: "2026-04-10T00:00:00.000Z",
      candidateScheduledFor: "2026-04-13T00:00:01.000Z",
    })).toBe(false);
  });

  it("describes notification labels for UI", () => {
    expect(describeNotificationType("estimate_reminder_24h")).toContain("24h");
    expect(describeNotificationType("invoice_weekly_statement")).toContain("weekly statement");
  });
});
