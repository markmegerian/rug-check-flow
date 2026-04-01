import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("office thread routing", () => {
  it("uses /ops inbox deep links from estimate and invoice actions", () => {
    const estimates = readFileSync(resolve(process.cwd(), "src/components/office/EstimatesTab.tsx"), "utf-8");
    const invoices = readFileSync(resolve(process.cwd(), "src/components/office/InvoicesTab.tsx"), "utf-8");
    expect(estimates).toContain("/ops?tab=inbox&threadId=");
    expect(invoices).toContain("/ops?tab=inbox&threadId=");
  });

  it("threads requestedThreadId through Operations into InboxTab", () => {
    const operations = readFileSync(resolve(process.cwd(), "src/pages/Operations.tsx"), "utf-8");
    const inbox = readFileSync(resolve(process.cwd(), "src/components/office/InboxTab.tsx"), "utf-8");
    expect(operations).toContain('const requestedThreadId = searchParams.get("threadId")');
    expect(operations).toContain('<InboxTab requestedThreadId={requestedThreadId} />');
    expect(inbox).toContain('if (requestedThreadId)');
  });
});
