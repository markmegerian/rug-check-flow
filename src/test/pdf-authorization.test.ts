import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("pdf authorization hardening", () => {
  it("applies portal ownership checks in both estimate and invoice branches", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/invoice-pdf/index.ts"), "utf-8");
    const matches = fn.match(/from\("portal_users"\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("resolves company branding using a company id instead of first-row lookup", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/invoice-pdf/index.ts"), "utf-8");
    expect(fn).toContain("fetchCompanyInfo(adminClient, companyId)");
    expect(fn).toContain('.eq("company_id", companyId)');
    expect(fn).toContain('select("id, client_id, company_id, invoice_number, total, issued_at, due_at, created_at, pdf_storage_path")');
    expect(fn).toContain('companyId = invoice.company_id ?? null;');
  });
});
