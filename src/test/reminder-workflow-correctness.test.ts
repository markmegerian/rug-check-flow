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

  it("keeps check-in estimate gating on the backend workflow", () => {
    const workflow = readFileSync(resolve(process.cwd(), "supabase/functions/check-in-workflow/index.ts"), "utf-8");
    expect(workflow).toContain('Boolean(rule?.requires_estimate) && !isCleaningCategory(rule?.category)');
    expect(workflow).toContain('notification_type: "estimate_batch_send"');
  });

  it("allows manual and scheduler auth paths for reminder cadence processing", () => {
    const workflow = readFileSync(resolve(process.cwd(), "supabase/functions/process-notification-cadence/index.ts"), "utf-8");
    const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf-8");
    expect(workflow).toContain('x-cron-secret');
    expect(workflow).toContain('let invocationMode: "manual" | "scheduler" = "manual"');
    expect(workflow).toContain('Forbidden: user is not linked to a company');
    expect(config).toContain('[functions.process-notification-cadence]');
    expect(config).toContain('verify_jwt = false');
  });
});
