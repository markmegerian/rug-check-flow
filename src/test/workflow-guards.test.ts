import { describe, expect, it } from "vitest";
import {
  canTransitionPickupStatus,
  canTransitionEstimateStatus,
  canRoleTransitionPickupStatus,
  canRoleTransitionEstimateStatus,
  canDriverCompletePickup,
  canPortalEditPickup,
  normalizePortalPickupStatus,
  type PickupRequestStatus,
  type EstimateStatus,
  type WorkflowRole,
} from "@/lib/workflow-guards";

describe("pickup status transitions", () => {
  const validTransitions: [PickupRequestStatus, PickupRequestStatus][] = [
    ["pending", "confirmed"],
    ["pending", "assigned"],
    ["pending", "cancelled"],
    ["confirmed", "assigned"],
    ["confirmed", "cancelled"],
    ["assigned", "completed"],
    ["assigned", "cancelled"],
  ];

  const invalidTransitions: [PickupRequestStatus, PickupRequestStatus][] = [
    ["completed", "pending"],
    ["completed", "cancelled"],
    ["cancelled", "pending"],
    ["cancelled", "confirmed"],
    ["assigned", "pending"],
    ["assigned", "confirmed"],
    ["confirmed", "pending"],
    ["pending", "completed"],
  ];

  it.each(validTransitions)("allows %s → %s", (from, to) => {
    expect(canTransitionPickupStatus(from, to)).toBe(true);
  });

  it.each(invalidTransitions)("blocks %s → %s", (from, to) => {
    expect(canTransitionPickupStatus(from, to)).toBe(false);
  });

  it("terminal states have no valid transitions", () => {
    const terminals: PickupRequestStatus[] = ["completed", "cancelled"];
    const allStatuses: PickupRequestStatus[] = ["pending", "confirmed", "assigned", "completed", "cancelled"];
    for (const terminal of terminals) {
      for (const target of allStatuses) {
        expect(canTransitionPickupStatus(terminal, target)).toBe(false);
      }
    }
  });
});

describe("estimate status transitions", () => {
  const validTransitions: [EstimateStatus, EstimateStatus][] = [
    ["draft", "needs_office_review"],
    ["draft", "expired"],
    ["needs_office_review", "ready_to_send"],
    ["needs_office_review", "needs_revision"],
    ["ready_to_send", "sent"],
    ["sent", "approved"],
    ["sent", "rejected"],
    ["sent", "needs_revision"],
    ["sent", "expired"],
    ["rejected", "needs_revision"],
    ["needs_revision", "needs_office_review"],
  ];

  const invalidTransitions: [EstimateStatus, EstimateStatus][] = [
    ["approved", "draft"],
    ["approved", "rejected"],
    ["rejected", "approved"],
    ["rejected", "sent"],
    ["expired", "draft"],
    ["expired", "sent"],
    ["draft", "approved"],
    ["draft", "rejected"],
    ["needs_office_review", "sent"],
    ["ready_to_send", "approved"],
  ];

  it.each(validTransitions)("allows %s → %s", (from, to) => {
    expect(canTransitionEstimateStatus(from, to)).toBe(true);
  });

  it.each(invalidTransitions)("blocks %s → %s", (from, to) => {
    expect(canTransitionEstimateStatus(from, to)).toBe(false);
  });
});

describe("role-based pickup transitions", () => {
  const roleTests: { role: WorkflowRole; from: PickupRequestStatus; to: PickupRequestStatus; expected: boolean }[] = [
    // Admin/office can do anything valid
    { role: "admin", from: "pending", to: "confirmed", expected: true },
    { role: "admin", from: "pending", to: "assigned", expected: true },
    { role: "admin", from: "assigned", to: "completed", expected: true },
    { role: "office", from: "confirmed", to: "assigned", expected: true },
    { role: "office", from: "assigned", to: "cancelled", expected: true },

    // Driver can only do assigned → completed
    { role: "driver", from: "assigned", to: "completed", expected: true },
    { role: "driver", from: "pending", to: "confirmed", expected: false },
    { role: "driver", from: "pending", to: "cancelled", expected: false },
    { role: "driver", from: "assigned", to: "cancelled", expected: false },

    // Portal can only do pending → cancelled
    { role: "portal", from: "pending", to: "cancelled", expected: true },
    { role: "portal", from: "confirmed", to: "cancelled", expected: false },
    { role: "portal", from: "pending", to: "confirmed", expected: false },

    // Checkin staff has no pickup transition rights
    { role: "checkin_staff", from: "pending", to: "confirmed", expected: false },
    { role: "checkin_staff", from: "assigned", to: "completed", expected: false },
  ];

  it.each(roleTests)("$role: $from → $to = $expected", ({ role, from, to, expected }) => {
    expect(canRoleTransitionPickupStatus(role, from, to)).toBe(expected);
  });

  it("always returns false for invalid base transitions regardless of role", () => {
    expect(canRoleTransitionPickupStatus("admin", "completed", "pending")).toBe(false);
    expect(canRoleTransitionPickupStatus("office", "cancelled", "assigned")).toBe(false);
  });
});

describe("role-based estimate transitions", () => {
  it("office can perform valid internal and final estimate transitions", () => {
    expect(canRoleTransitionEstimateStatus("office", "draft", "needs_office_review")).toBe(true);
    expect(canRoleTransitionEstimateStatus("office", "needs_office_review", "ready_to_send")).toBe(true);
    expect(canRoleTransitionEstimateStatus("office", "needs_office_review", "needs_revision")).toBe(true);
    expect(canRoleTransitionEstimateStatus("office", "ready_to_send", "sent")).toBe(true);
    expect(canRoleTransitionEstimateStatus("office", "sent", "approved")).toBe(true);
    expect(canRoleTransitionEstimateStatus("office", "sent", "rejected")).toBe(true);
    expect(canRoleTransitionEstimateStatus("office", "sent", "expired")).toBe(true);
  });

  it("portal can approve or reject sent estimates", () => {
    expect(canRoleTransitionEstimateStatus("portal", "sent", "approved")).toBe(true);
    expect(canRoleTransitionEstimateStatus("portal", "sent", "rejected")).toBe(true);
  });

  it("portal cannot expire, send, or transition internal states", () => {
    expect(canRoleTransitionEstimateStatus("portal", "sent", "expired")).toBe(false);
    expect(canRoleTransitionEstimateStatus("portal", "draft", "needs_office_review")).toBe(false);
    expect(canRoleTransitionEstimateStatus("portal", "ready_to_send", "sent")).toBe(false);
  });

  it("checkin_staff has no estimate transition rights", () => {
    expect(canRoleTransitionEstimateStatus("checkin_staff", "draft", "needs_office_review")).toBe(false);
    expect(canRoleTransitionEstimateStatus("checkin_staff", "sent", "approved")).toBe(false);
  });

  it("driver has no estimate transition rights", () => {
    expect(canRoleTransitionEstimateStatus("driver", "draft", "needs_office_review")).toBe(false);
  });
});

describe("canDriverCompletePickup", () => {
  it("allows completion when all conditions met", () => {
    expect(canDriverCompletePickup({ status: "assigned", allVerified: true, hasSignature: true })).toBe(true);
  });

  it("blocks when items not verified", () => {
    expect(canDriverCompletePickup({ status: "assigned", allVerified: false, hasSignature: true })).toBe(false);
  });

  it("blocks when signature missing", () => {
    expect(canDriverCompletePickup({ status: "assigned", allVerified: true, hasSignature: false })).toBe(false);
  });

  it("blocks when both conditions missing", () => {
    expect(canDriverCompletePickup({ status: "assigned", allVerified: false, hasSignature: false })).toBe(false);
  });

  it("blocks when status is not assigned", () => {
    expect(canDriverCompletePickup({ status: "pending", allVerified: true, hasSignature: true })).toBe(false);
    expect(canDriverCompletePickup({ status: "completed", allVerified: true, hasSignature: true })).toBe(false);
  });
});

describe("canPortalEditPickup", () => {
  it("allows editing only when pending", () => {
    expect(canPortalEditPickup("pending")).toBe(true);
    expect(canPortalEditPickup("confirmed")).toBe(false);
    expect(canPortalEditPickup("assigned")).toBe(false);
    expect(canPortalEditPickup("completed")).toBe(false);
    expect(canPortalEditPickup("cancelled")).toBe(false);
  });
});

describe("normalizePortalPickupStatus", () => {
  it("keeps pending as pending", () => {
    expect(normalizePortalPickupStatus("pending")).toBe("pending");
  });

  it("keeps confirmed as confirmed", () => {
    expect(normalizePortalPickupStatus("confirmed")).toBe("confirmed");
  });

  it("normalizes all other statuses to confirmed", () => {
    expect(normalizePortalPickupStatus("assigned")).toBe("confirmed");
    expect(normalizePortalPickupStatus("completed")).toBe("confirmed");
    expect(normalizePortalPickupStatus("cancelled")).toBe("confirmed");
  });
});
