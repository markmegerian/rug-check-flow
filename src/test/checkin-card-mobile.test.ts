import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("check-in mobile layout", () => {
  it("uses the simplified tabbed mobile shell without the removed log panel", () => {
    const file = readFileSync(resolve(process.cwd(), "src/components/facility/CheckInLayout.tsx"), "utf-8");
    expect(file).toContain('type MobilePanel = "form" | "pending"');
    expect(file).toContain('label: "Check-In"');
    expect(file).toContain('label: `Pending (${pendingRugs.length})`');
    expect(file).not.toContain('label: `Log (${checkInLog.length})`');
    expect(file).toContain('mobilePanel === "form"');
    expect(file).not.toContain('CheckInLogPanel');
    expect(file).not.toContain('src/components/checkin/CheckInQueue.tsx');
  });
});
