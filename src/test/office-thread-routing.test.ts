import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("office thread routing", () => {
  it("uses portal message deep links from estimate and invoice actions", () => {
    const estimates = readFileSync(resolve(process.cwd(), "src/components/office/EstimatesTab.tsx"), "utf-8");
    const invoices = readFileSync(resolve(process.cwd(), "src/components/office/InvoicesTab.tsx"), "utf-8");
    expect(estimates).toContain("/portal/messages?threadId=");
    expect(invoices).toContain("/portal/messages?threadId=");
  });

  it("threads requestedThreadId through portal messages", () => {
    const portal = readFileSync(resolve(process.cwd(), "src/pages/WholesalePortal.tsx"), "utf-8");
    const messages = readFileSync(resolve(process.cwd(), "src/components/portal/PortalMessagesTab.tsx"), "utf-8");
    expect(portal).toContain('const requestedThreadId = searchParams.get("threadId")');
    expect(portal).toContain('<PortalMessagesTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />');
    expect(messages).toContain('if (requestedThreadId)');
  });
});
