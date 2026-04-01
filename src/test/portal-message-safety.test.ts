import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("portal message safety and rendering", () => {
  it("loads sender and attachments for thread previews and filters internal notes", () => {
    const portal = readFileSync(resolve(process.cwd(), "src/components/portal/PortalMessagesTab.tsx"), "utf-8");
    expect(portal).toContain("sender,");
    expect(portal).toContain("attachments");
    expect(portal).toContain("visibleMessages = rowMessages.filter");
    expect(portal).toContain("!isInternalMessage(message.attachments)");
  });

  it("renders portal-authored messages using the current user id", () => {
    const portal = readFileSync(resolve(process.cwd(), "src/components/portal/PortalMessagesTab.tsx"), "utf-8");
    expect(portal).toContain('message.sender === user?.id ? "portal" : message.sender ? "office" : "system"');
  });
});
