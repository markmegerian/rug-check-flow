import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("reminder workflow correctness", () => {
  it("only seeds estimate cadence on successful provider send", () => {
    const estimates = readFileSync(resolve(process.cwd(), "src/components/office/EstimatesTab.tsx"), "utf-8");
    expect(estimates).toContain('data?.provider_status === "sent"');
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
});
