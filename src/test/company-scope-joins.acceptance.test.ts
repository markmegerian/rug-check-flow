import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("company-scope join correctness", () => {
  it("uses intake_jobs + clients for rug company resolution", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260401215500_fix_company_scope_join_paths.sql"), "utf-8");
    expect(migration).toContain("from public.intake_jobs ij");
    expect(migration).toContain("join public.clients c on c.id = ij.client_id");
    expect(migration).toContain("payments.company_id must match client_accounts.company_id");
  });

  it("uses client_accounts for payment client company resolution", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260401215500_fix_company_scope_join_paths.sql"), "utf-8");
    expect(migration).toContain("from public.client_accounts ca");
    expect(migration).toContain("left join public.client_accounts ca on ca.id = p_inner.client_id");
  });
});
