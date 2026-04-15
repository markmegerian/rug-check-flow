import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("reminder workflow correctness", () => {
  it("queues estimates for the daily batch instead of sending immediately from the office tab", () => {
    const estimates = readFileSync(resolve(process.cwd(), "src/components/office/EstimatesTab.tsx"), "utf-8");
    expect(estimates).toContain("queueEstimateForBatchSend");
    expect(estimates).not.toContain("send-estimate-email");
  });

  it("does not seed invoice cadence at draft creation", () => {
    const createSheet = readFileSync(resolve(process.cwd(), "src/components/office/InvoiceCreateSheet.tsx"), "utf-8");
    expect(createSheet).not.toContain("seedInvoiceReminderCadence");
  });

  it("marks estimate sent only after successful provider delivery", () => {
    const edge = readFileSync(resolve(process.cwd(), "supabase/functions/send-estimate-email/index.ts"), "utf-8");
    const failedIndex = edge.indexOf('success: false');
    const statusUpdateIndex = edge.indexOf('.update({ status: "sent", sent_at: nowIso })');
    expect(failedIndex).toBeGreaterThan(-1);
    expect(statusUpdateIndex).toBeGreaterThan(failedIndex);
  });

  it("does not mark estimates sent when client email is missing", () => {
    const edge = readFileSync(resolve(process.cwd(), "supabase/functions/send-estimate-email/index.ts"), "utf-8");
    const noEmailIndex = edge.indexOf('provider_status: "no_email"');
    const statusUpdateIndex = edge.indexOf('.update({ status: "sent", sent_at: nowIso })');
    expect(noEmailIndex).toBeGreaterThan(-1);
    expect(statusUpdateIndex).toBeGreaterThan(noEmailIndex);
    expect(edge).not.toContain('estimate_marked_sent_without_email');
  });
});
