import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("internal company membership bootstrap", () => {
  it("backfills company memberships for internal staff roles into the single facility company", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260416225000_backfill_internal_company_memberships.sql"),
      "utf-8",
    );

    expect(migration).toContain("from public.user_roles ur");
    expect(migration).toContain("where ur.role in ('admin', 'office', 'checkin_staff', 'driver', 'staff')");
    expect(migration).toContain("'company_admin'::public.company_role");
    expect(migration).toContain("'staff'::public.company_role");
    expect(migration).toContain("multiple companies exist");
  });
});
