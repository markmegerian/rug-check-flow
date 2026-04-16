import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SERVICES,
  SERVICE_CATEGORIES,
  SERVICE_PRESETS,
  RUG_TYPES,
} from "@/data/services";

describe("SERVICES", () => {
  it("has at least 10 services", () => {
    expect(SERVICES.length).toBeGreaterThanOrEqual(10);
  });

  it("every service has required fields", () => {
    for (const svc of SERVICES) {
      expect(svc.id).toBeTruthy();
      expect(svc.name).toBeTruthy();
      expect(svc.category).toBeTruthy();
      expect(svc.basePrice).toBeGreaterThanOrEqual(0);
      expect(["sqft", "flat"]).toContain(svc.unit);
    }
  });

  it("service IDs are unique", () => {
    const ids = SERVICES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every service belongs to a known category", () => {
    for (const svc of SERVICES) {
      expect(SERVICE_CATEGORIES).toContain(svc.category);
    }
  });
});

describe("SERVICE_CATEGORIES", () => {
  it("has 4 categories", () => {
    expect(SERVICE_CATEGORIES).toHaveLength(4);
  });

  it("includes Cleaning, Repair, Protection, Specialty", () => {
    expect(SERVICE_CATEGORIES).toContain("Cleaning");
    expect(SERVICE_CATEGORIES).toContain("Repair");
    expect(SERVICE_CATEGORIES).toContain("Protection");
    expect(SERVICE_CATEGORIES).toContain("Specialty");
  });
});

describe("SERVICE_PRESETS", () => {
  it("has at least 3 presets", () => {
    expect(SERVICE_PRESETS.length).toBeGreaterThanOrEqual(3);
  });

  it("every preset references existing service IDs", () => {
    const validIds = new Set(SERVICES.map((s) => s.id));
    for (const preset of SERVICE_PRESETS) {
      for (const sid of preset.serviceIds) {
        expect(validIds.has(sid), `Preset "${preset.name}" references unknown service ID: ${sid}`).toBe(true);
      }
    }
  });

  it("preset IDs are unique", () => {
    const ids = SERVICE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("RUG_TYPES", () => {
  it("has at least 10 rug types", () => {
    expect(RUG_TYPES.length).toBeGreaterThanOrEqual(10);
  });

  it("includes common rug types", () => {
    expect(RUG_TYPES).toContain("Persian");
    expect(RUG_TYPES).toContain("Oriental");
    expect(RUG_TYPES).toContain("Turkish");
    expect(RUG_TYPES).toContain("Other");
  });

  it("types are unique", () => {
    expect(new Set(RUG_TYPES).size).toBe(RUG_TYPES.length);
  });
});

describe("cleaning approval defaults", () => {
  it("defaults cleaning rug services to approved during check-in inserts", () => {
    const approvalFile = readFileSync(resolve(process.cwd(), "src/lib/rug-service-approval.ts"), "utf-8");
    expect(approvalFile).toContain('const defaultApprovalStatus = isCleaningCategory(category) ? "approved" : "pending";');
  });
});
