import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("check-in mobile layout", () => {
  it("uses the current tabbed mobile shell instead of the removed CheckInQueue component", () => {
    const file = readFileSync(resolve(process.cwd(), "src/components/facility/CheckInLayout.tsx"), "utf-8");
    expect(file).toContain('type MobilePanel = "form" | "pending" | "log"');
    expect(file).toContain('label: "Check-In"');
    expect(file).toContain('label: `Pending (${pendingRugs.length})`');
    expect(file).toContain('label: `Log (${checkInLog.length})`');
    expect(file).toContain('mobilePanel === "form"');
    expect(file).not.toContain('src/components/checkin/CheckInQueue.tsx');
  });
});
