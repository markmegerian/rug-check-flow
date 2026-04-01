import { describe, expect, it } from "vitest";
import { deriveThreadLifecycle, sortThreads } from "@/lib/thread-lifecycle";

describe("thread lifecycle helpers", () => {
  it("marks a thread unread when latest inbound is newer than outbound", () => {
    const view = deriveThreadLifecycle({
      selfSender: "office",
      messages: [
        { created_at: "2026-04-01T00:00:00.000Z", sender: "office" },
        { created_at: "2026-04-01T01:00:00.000Z", sender: "portal" },
      ],
    });
    expect(view.unread).toBe(true);
  });

  it("marks a thread read when office replied after inbound", () => {
    const view = deriveThreadLifecycle({
      selfSender: "office",
      messages: [
        { created_at: "2026-04-01T00:00:00.000Z", sender: "portal" },
        { created_at: "2026-04-01T01:00:00.000Z", sender: "office" },
      ],
    });
    expect(view.unread).toBe(false);
  });

  it("sorts unread active threads before read/closed ones", () => {
    const rows = sortThreads([
      { unread: false, status: "active" as const, latestMessageAt: "2026-04-01T01:00:00.000Z", updated_at: "2026-04-01T01:00:00.000Z" },
      { unread: true, status: "active" as const, latestMessageAt: "2026-04-01T00:00:00.000Z", updated_at: "2026-04-01T00:00:00.000Z" },
      { unread: false, status: "archived" as const, latestMessageAt: "2026-04-01T03:00:00.000Z", updated_at: "2026-04-01T03:00:00.000Z" },
    ]);
    expect(rows[0].unread).toBe(true);
    expect(rows[2].status).toBe("archived");
  });
});
