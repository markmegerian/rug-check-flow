import { describe, expect, it } from "vitest";
import { PRODUCTION_STAGES } from "@/data/production";
import { SERVICES, RUG_TYPES, SERVICE_CATEGORIES } from "@/data/services";
import { ROLE_DEFINITIONS } from "@/lib/role-definitions";
import { DAYS_OF_WEEK, PRICING_TIERS, TIER_LABELS, TIER_COLORS, DAY_INDEX } from "@/lib/constants";
import { APP_NAME } from "@/lib/branding";

describe("cross-module data integrity", () => {
  it("DAY_INDEX covers all 7 standard days", () => {
    const expectedDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (const day of expectedDays) {
      expect(DAY_INDEX[day]).toBeDefined();
    }
  });

  it("DAYS_OF_WEEK entries all exist in DAY_INDEX", () => {
    for (const day of DAYS_OF_WEEK) {
      expect(DAY_INDEX[day]).toBeDefined();
    }
  });

  it("all pricing tiers have corresponding labels and colors", () => {
    for (const tier of PRICING_TIERS) {
      expect(TIER_LABELS[tier]).toBeTruthy();
      expect(TIER_COLORS[tier]).toBeTruthy();
    }
  });

  it("production stages form a valid pipeline (no gaps)", () => {
    const ids = PRODUCTION_STAGES.map((s) => s.id);
    // First stage should be an intake stage
    expect(ids[0]).toBe("checked_in");
    // Last stage should be an exit stage
    expect(ids[ids.length - 1]).toBe("picked_up");
    // All stages have unique IDs
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("role definitions match the AppRole type expectations", () => {
    const roleIds = new Set(ROLE_DEFINITIONS.map((r) => r.id));
    // These are the roles used in workflow-guards.ts
    expect(roleIds.has("admin")).toBe(true);
    expect(roleIds.has("office")).toBe(true);
    expect(roleIds.has("driver")).toBe(true);
    expect(roleIds.has("checkin_staff")).toBe(true);
  });

  it("every service category has at least one service", () => {
    for (const cat of SERVICE_CATEGORIES) {
      const catServices = SERVICES.filter((s) => s.category === cat);
      expect(catServices.length, `Category "${cat}" has no services`).toBeGreaterThan(0);
    }
  });

  it("rug types are not empty strings", () => {
    for (const type of RUG_TYPES) {
      expect(type.length).toBeGreaterThan(0);
    }
  });

  it("APP_NAME does not contain HTML or special characters", () => {
    expect(APP_NAME).not.toMatch(/[<>&"']/);
  });
});
