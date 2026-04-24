import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("portal onboarding flow", () => {
  it("sends a single secure link instead of temporary-password instructions", () => {
    const fn = readFileSync(resolve(process.cwd(), "supabase/functions/send-portal-onboarding-email/index.ts"), "utf-8");

    expect(fn).not.toContain("manual_activation_only");
    expect(fn).not.toContain("temporary password to sign in once");
    expect(fn).toContain('url.searchParams.set("flow", "portal-onboarding")');
    expect(fn).toContain('url.searchParams.set("next", "/portal/rugs")');
    expect(fn).toContain("Open your portal with this secure link:");
  });

  it("refreshes auth state after password change before portal redirect", () => {
    const resetPasswordPage = readFileSync(resolve(process.cwd(), "src/pages/ResetPassword.tsx"), "utf-8");
    const authContext = readFileSync(resolve(process.cwd(), "src/contexts/AuthContext.tsx"), "utf-8");

    expect(authContext).toContain("refreshAuthState");
    expect(resetPasswordPage).toContain("const refreshed = await refreshAuthState();");
    expect(resetPasswordPage).toContain('navigate(nextPath, { replace: true })');
  });
});
