import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("portal estimate visibility cutover", () => {
  it("adds a backend helper that only exposes client-facing estimate states", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260424123000_add_portal_estimate_read_function.sql"), "utf-8");
    expect(migration).toContain("create or replace function public.get_portal_estimates()");
    expect(migration).toContain("from public.portal_users pu");
    expect(migration).toContain("where e.status in ('sent', 'approved', 'rejected')");
    expect(migration).toContain("or (e.status = 'expired' and e.sent_at is not null)");
    expect(migration).toContain("grant execute on function public.get_portal_estimates() to authenticated;");
  });
});
