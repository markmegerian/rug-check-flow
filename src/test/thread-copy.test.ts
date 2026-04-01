import { describe, expect, it } from "vitest";
import { getThreadComposerPlaceholder, getThreadSummaryLabel } from "@/lib/thread-copy";

describe("thread copy helpers", () => {
  it("returns context-aware office placeholders", () => {
    expect(getThreadComposerPlaceholder({ threadType: "invoice", entityLabel: "INV-1001", perspective: "office" })).toContain("billing reply");
  });

  it("returns context-aware portal placeholders", () => {
    expect(getThreadComposerPlaceholder({ threadType: "estimate", entityLabel: "EST-1001", perspective: "portal" })).toContain("EST-1001");
  });

  it("returns perspective-aware thread summary labels", () => {
    expect(getThreadSummaryLabel({ threadType: "estimate", entityLabel: "EST-1001", perspective: "office" })).toContain("Client conversation");
    expect(getThreadSummaryLabel({ threadType: "invoice", entityLabel: "INV-1001", perspective: "portal" })).toContain("office inbox");
  });
});
