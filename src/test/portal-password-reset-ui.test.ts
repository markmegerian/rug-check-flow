import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("portal password reset UI wiring", () => {
  it("invokes the admin reset edge function from the client management screen", () => {
    const clientsTab = readFileSync(resolve(process.cwd(), "src/components/office/ClientsTab.tsx"), "utf-8");

    expect(clientsTab).toContain('supabase.functions.invoke<ResetPortalPasswordResponse>(');
    expect(clientsTab).toContain('"admin-reset-portal-password"');
    expect(clientsTab).toContain('must change this password at next sign-in');
  });

  it("shows reset-password controls and pending-state messaging for portal users", () => {
    const clientDetailSheet = readFileSync(resolve(process.cwd(), "src/components/office/ClientDetailSheet.tsx"), "utf-8");

    expect(clientDetailSheet).toContain('Password reset required');
    expect(clientDetailSheet).toContain('Reset password');
    expect(clientDetailSheet).toContain('password reset required');
  });
});
