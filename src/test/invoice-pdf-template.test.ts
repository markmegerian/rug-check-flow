import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("invoice pdf template alignment", () => {
  it("includes client identity in billing and shipping blocks like the approved template", () => {
    const shared = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/invoice-pdf.ts"), "utf-8");
    expect(shared).toContain('if (payload.client.name) billingLines.push(payload.client.name);');
    expect(shared).toContain('shippingLines.push(payload.client.contactName || payload.client.name || "");');
  });

  it("renders a rug notes line for every rug and removes per-rug subtotal headers", () => {
    const shared = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/invoice-pdf.ts"), "utf-8");
    expect(shared).toContain('const fullText = notePrefix + (rug.notes || "");');
    expect(shared).toContain('for (let i = 0; i < Math.max(noteLines.length, 1); i++)');
    expect(shared).not.toContain('Sub total:');
  });

  it("keeps service names on the PDF instead of collapsing fallback lines to rug tags", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/invoice-pdf/index.ts"), "utf-8");
    expect(fn).toContain('function extractServiceName(description: string): string');
    expect(fn).toContain('name: extractServiceName(item.description),');
    expect(fn).not.toContain('replace(/\\s*—\\s*.*$/, "")');
  });
});
