import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("check-in layout boundary", () => {
  it("uses the standalone pending-rail layout without walk-in controls or mobile tab shell", () => {
    const file = readFileSync(resolve(process.cwd(), "src/components/facility/CheckInLayout.tsx"), "utf-8");
    expect(file).toContain("const hasPendingRail = pendingRugs.length > 0;");
    expect(file).toContain("hasPendingRail ? (");
    expect(file).not.toContain("type MobilePanel");
    expect(file).not.toContain("onAddWalkIn");
    expect(file).not.toContain("walkin");
  });
});
