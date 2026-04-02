import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("operational reminder links", () => {
  it("routes reminders to real Operations tab ids", () => {
    const hook = readFileSync(resolve(process.cwd(), "src/hooks/useOperationalReminders.ts"), "utf-8");
    expect(hook).toContain('/ops?tab=accounts-receivable');
    expect(hook).not.toContain('/ops?tab=invoices');
    expect(hook).not.toContain('/ops?tab=pickups');
  });
});
