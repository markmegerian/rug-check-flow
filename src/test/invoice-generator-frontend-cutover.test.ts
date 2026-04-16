import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("invoice generator frontend cutover", () => {
  it("routes handoff invoice generation through the backend workflow", () => {
    const file = readFileSync(resolve(process.cwd(), "src/components/facility/InvoiceGeneratorPanel.tsx"), "utf-8");
    expect(file).toContain('safeInvoke<GenerateInvoiceWorkflowResponse>("generate-invoice-workflow"');
    expect(file).not.toContain('.from("invoices")');
    expect(file).not.toContain('.from("invoice_items").insert(lineItems)');
    expect(file).not.toContain('event_type: "walkin_invoice_created"');
  });
});
