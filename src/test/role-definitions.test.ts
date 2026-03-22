import { describe, expect, it } from "vitest";
import { ROLE_DEFINITIONS } from "@/lib/role-definitions";

describe("ROLE_DEFINITIONS", () => {
  it("has exactly 4 roles", () => {
    expect(ROLE_DEFINITIONS).toHaveLength(4);
  });

  it("includes admin, office, checkin_staff, driver", () => {
    const ids = ROLE_DEFINITIONS.map((r) => r.id);
    expect(ids).toContain("admin");
    expect(ids).toContain("office");
    expect(ids).toContain("checkin_staff");
    expect(ids).toContain("driver");
  });

  it("each role has a name and description", () => {
    for (const role of ROLE_DEFINITIONS) {
      expect(role.name).toBeTruthy();
      expect(role.description).toBeTruthy();
    }
  });

  it("role IDs are unique", () => {
    const ids = ROLE_DEFINITIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
