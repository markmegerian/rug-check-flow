import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("invoice pdf template alignment", () => {
  it("uses the extracted sample fonts and logo assets for the invoice template", () => {
    const shared = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/invoice-pdf.ts"), "utf-8");
    expect(shared).toContain('import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";');
    expect(shared).toContain('import { SAMPLE_FONT_BOLD_BASE64, SAMPLE_FONT_REGULAR_BASE64 } from "./sample-fonts.ts";');
    expect(shared).toContain('import { SAMPLE_LOGO_PNG_BASE64 } from "./sample-logo.ts";');
    expect(existsSync(resolve(process.cwd(), "supabase/functions/_shared/sample-fonts.ts"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "supabase/functions/_shared/sample-logo.ts"))).toBe(true);
  });

  it("matches the sample page geometry and header blocks more closely", () => {
    const shared = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/invoice-pdf.ts"), "utf-8");
    expect(shared).toContain('const PAGE_W = 595.28;');
    expect(shared).toContain('const PAGE_H = 841.89;');
    expect(shared).toContain('builder.drawLogo();');
    expect(shared).toContain('builder.drawText("Billing Address:", BILLING_X, 664.11, BLOCK_FONT_SIZE, true);');
    expect(shared).not.toContain('if (payload.client.name) billingLines.push(payload.client.name);');
  });

  it("wraps long service names and renders rug notes in the sample-style table layout", () => {
    const shared = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/invoice-pdf.ts"), "utf-8");
    expect(shared).toContain('const nameLines = builder.wrapText(service.name, TABLE_FONT_SIZE, SERVICE_NAME_MAX_WIDTH);');
    expect(shared).toContain('builder.drawText("Rug Notes:", SERVICE_NAME_X, noteY, TABLE_FONT_SIZE, true);');
    expect(shared).not.toContain('Sub total:');
  });

  it("keeps service names on the PDF instead of collapsing fallback lines to rug tags", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/invoice-pdf/index.ts"), "utf-8");
    expect(fn).toContain('function extractServiceName(description: string): string');
    expect(fn).toContain('name: extractServiceName(item.description),');
    expect(fn).not.toContain('replace(/\\s*—\\s*.*$/, "")');
  });
});
