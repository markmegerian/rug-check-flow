import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("message / reminder permission hardening", () => {
  it("adds explicit RLS policies for message thread and cadence tables", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260401070000_message_thread_rls_hardening.sql"), "utf-8");
    expect(migration).toContain("alter table public.message_threads enable row level security;");
    expect(migration).toContain("alter table public.messages enable row level security;");
    expect(migration).toContain("alter table public.notification_cadence enable row level security;");
    expect(migration).toContain("Portal users view own client message threads");
    expect(migration).toContain("Portal users insert own client messages");
    expect(migration).toContain("Internal users manage notification cadence");
  });

  it("keeps notification cadence UI internal-only by design", () => {
    const card = readFileSync(resolve(process.cwd(), "src/components/office/NotificationCadenceCard.tsx"), "utf-8");
    expect(card).toContain("Reminder cadence");
    expect(card).not.toContain("PortalMessagesTab");
  });
});
