import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canPortalEditPickup,
  canRoleTransitionEstimateStatus,
  canRoleTransitionPickupStatus,
} from "@/lib/workflow-guards";
import { isEntryEditable, type CheckInEntry } from "@/data/check-in-log";

const baseEntry = (checkedInAt: Date): CheckInEntry => ({
  id: "entry-acceptance",
  rugNumber: "R-999",
  clientName: "Acceptance Client",
  rugType: "Persian",
  length: 9,
  width: 12,
  services: [{ id: "svc", name: "Wash", price: 100 }],
  totalPrice: 100,
  checkedInAt,
  checkedInBy: "staff",
});

describe("critical journey acceptance coverage", () => {
  it("journey 1: pickup request flow keeps pending-edit and role transition guardrails", () => {
    expect(canPortalEditPickup("pending")).toBe(true);
    expect(canPortalEditPickup("confirmed")).toBe(false);
    expect(canRoleTransitionPickupStatus("office", "pending", "assigned")).toBe(true);
    expect(canRoleTransitionPickupStatus("portal", "pending", "cancelled")).toBe(true);
  });

  it("journey 2: check-in to production flow enforces time-bound editability", () => {
    const fresh = baseEntry(new Date(Date.now() - 30 * 60 * 1000));
    const stale = baseEntry(new Date(Date.now() - 3 * 60 * 60 * 1000));

    expect(isEntryEditable(fresh, "checkin_staff")).toBe(true);
    expect(isEntryEditable(stale, "checkin_staff")).toBe(false);
    expect(isEntryEditable(stale, "office")).toBe(true);
  });

  it("journey 3: estimate lifecycle keeps role-scoped transition controls", () => {
    expect(canRoleTransitionEstimateStatus("office", "draft", "sent")).toBe(true);
    expect(canRoleTransitionEstimateStatus("portal", "sent", "approved")).toBe(true);
    expect(canRoleTransitionEstimateStatus("portal", "sent", "expired")).toBe(false);
  });

  it("journey 4: invoice send + PDF retrieval remains in readiness gate", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/private-beta-readiness.sh"), "utf-8");

    expect(script).toContain("Invoice PDF edge-function smoke");
    expect(script).toContain('"${SUPABASE_URL}/functions/v1/invoice-pdf"');
    expect(script).toContain("invoice-pdf response missing signed_url");
  });

  it("journey 5: onboarding + payment tracking remains in role-scope smoke", () => {
    const script = readFileSync(resolve(process.cwd(), "scripts/rls-scope-smoke-test.sh"), "utf-8");

    expect(script).toContain("payment_attempts?select=");
    expect(script).toContain("portal_users?select=");
    expect(script).toContain("portal invoices, invoice_items, payment_attempts, pickup_requests, and portal_users are readable");
  });
});
