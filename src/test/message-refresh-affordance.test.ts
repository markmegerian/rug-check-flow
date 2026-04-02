import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("message refresh affordance", () => {
  it("adds refresh affordances to office and portal messaging surfaces", () => {
    const office = readFileSync(resolve(process.cwd(), "src/components/office/InboxTab.tsx"), "utf-8");
    const portal = readFileSync(resolve(process.cwd(), "src/components/portal/PortalMessagesTab.tsx"), "utf-8");
    expect(office).toContain("RefreshCw");
    expect(portal).toContain("RefreshCw");
    expect(office).toContain("Refresh");
    expect(portal).toContain("Refresh");
  });

  it("polls while a thread is selected", () => {
    const office = readFileSync(resolve(process.cwd(), "src/components/office/InboxTab.tsx"), "utf-8");
    const portal = readFileSync(resolve(process.cwd(), "src/components/portal/PortalMessagesTab.tsx"), "utf-8");
    expect(office).toContain("setInterval");
    expect(portal).toContain("setInterval");
  });
});
