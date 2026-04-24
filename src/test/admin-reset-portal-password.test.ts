import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin portal password reset function", () => {
  it("forces a password change after admin reset instead of clearing the flag", () => {
    const fn = readFileSync(
      resolve(process.cwd(), "supabase/functions/admin-reset-portal-password/index.ts"),
      "utf-8",
    );

    expect(fn).toContain('must_change_password: true');
    expect(fn).toContain('.update({ status: "active", must_change_password: true })');
    expect(fn).not.toContain('must_change_password: false');
  });

  it("guards against short passwords and duplicate portal-user matches", () => {
    const fn = readFileSync(
      resolve(process.cwd(), "supabase/functions/admin-reset-portal-password/index.ts"),
      "utf-8",
    );

    expect(fn).toContain('password must be at least 8 characters');
    expect(fn).toContain('Multiple portal users found for that email');
    expect(fn).toContain('while (page <= 10)');
  });
});
