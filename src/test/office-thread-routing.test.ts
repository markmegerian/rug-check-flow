import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("office thread routing", () => {
  it("routes office estimate and invoice actions into the office inbox", () => {
    const estimates = readFileSync(resolve(process.cwd(), "src/components/office/EstimatesTab.tsx"), "utf-8");
    const invoices = readFileSync(resolve(process.cwd(), "src/components/office/InvoicesTab.tsx"), "utf-8");
    expect(estimates).toContain("/office/inbox?threadId=");
    expect(invoices).toContain("/office/inbox?threadId=");
  });

  it("keeps requestedThreadId parsing while both inbox surfaces stay connected", () => {
    const office = readFileSync(resolve(process.cwd(), "src/pages/OfficeWorkspace.tsx"), "utf-8");
    const portal = readFileSync(resolve(process.cwd(), "src/pages/WholesalePortal.tsx"), "utf-8");
    const messages = readFileSync(resolve(process.cwd(), "src/components/portal/PortalMessagesTab.tsx"), "utf-8");
    expect(office).toContain('const requestedThreadId = searchParams.get("threadId")');
    expect(office).toContain('{location.pathname === "/office/inbox" ? <InboxTab requestedThreadId={requestedThreadId} /> : null}');
    expect(portal).toContain('<PortalMessagesTab clientId={clientId} loading={portalClientLoading} errorMessage={errorMessage} requestedThreadId={requestedThreadId} />');
    expect(messages).toContain('if (requestedThreadId)');
  });
});
