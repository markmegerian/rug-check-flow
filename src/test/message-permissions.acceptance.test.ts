import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("message / reminder permission hardening", () => {
  it("uses supported role/email helpers and company scoping in the RLS migration", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260401070000_message_thread_rls_hardening.sql"), "utf-8");
    expect(migration).toContain("public.get_user_company_id(auth.uid())");
    expect(migration).toContain("public.has_role(auth.uid(), 'admin'::public.app_role)");
    expect(migration).toContain("auth.jwt() ->> 'email'");
    expect(migration).not.toContain("has_any_role");
    expect(migration).not.toContain("auth.email()");
  });

  it("keeps portal access limited to own-client message reads/inserts", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260401070000_message_thread_rls_hardening.sql"), "utf-8");
    expect(migration).toContain("Portal users view own client message threads");
    expect(migration).toContain("Portal users insert own client messages");
  });
});
