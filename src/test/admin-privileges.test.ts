import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("admin / mission control hardening", () => {
  it("auth context distinguishes mission control from broad admin UI access", () => {
    const authContext = readFileSync(resolve(process.cwd(), "src/contexts/AuthContext.tsx"), "utf-8");
    expect(authContext).toContain("const isMissionControl = isSuperAdminEmail(user?.email);");
    expect(authContext).toContain("const isSuperAdmin = isMissionControl || roles.includes(\"admin\");");
  });

  it("user management restricts admin-role escalation and deletion to mission control", () => {
    const usersTab = readFileSync(resolve(process.cwd(), "src/components/admin/UsersTab.tsx"), "utf-8");
    expect(usersTab).toContain("Only Mission Control access can grant admin role.");
    expect(usersTab).toContain("Only Mission Control access can modify other admin users.");
    expect(usersTab).toContain("(!isMissionControl && editingUser.role === \"admin\")");
  });
});
