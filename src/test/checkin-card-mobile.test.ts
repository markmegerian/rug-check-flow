import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("check-in queue mobile card", () => {
  it("uses a compact stat grid instead of stacked status pills for mobile", () => {
    const file = readFileSync(resolve(process.cwd(), "src/components/checkin/CheckInQueue.tsx"), "utf-8");
    expect(file).toContain("grid-cols-2");
    expect(file).toContain("Truck");
    expect(file).toContain("Estimates");
    expect(file).toContain("Attention");
  });
});
