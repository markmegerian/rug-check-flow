export type WorkflowRole = "admin" | "office" | "checkin_staff" | "driver" | "portal";
export type PickupRequestStatus = "pending" | "confirmed" | "assigned" | "completed" | "cancelled";
export type EstimateStatus = "draft" | "sent" | "approved" | "rejected" | "expired";

const PICKUP_TRANSITIONS: Record<PickupRequestStatus, PickupRequestStatus[]> = {
  pending: ["confirmed", "assigned", "cancelled"],
  confirmed: ["assigned", "cancelled"],
  assigned: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const ESTIMATE_TRANSITIONS: Record<EstimateStatus, EstimateStatus[]> = {
  draft: ["sent", "expired"],
  sent: ["approved", "rejected", "expired"],
  approved: [],
  rejected: [],
  expired: [],
};

export function normalizePortalPickupStatus(status: PickupRequestStatus): "pending" | "confirmed" {
  return status === "pending" || status === "confirmed" ? status : "confirmed";
}

export function canPortalEditPickup(status: PickupRequestStatus): boolean {
  return status === "pending";
}

export function canTransitionPickupStatus(
  current: PickupRequestStatus,
  next: PickupRequestStatus
): boolean {
  const allowed = PICKUP_TRANSITIONS[current];
  if (!allowed) return false;
  return allowed.includes(next);
}

export function canRoleTransitionPickupStatus(
  role: WorkflowRole,
  current: PickupRequestStatus,
  next: PickupRequestStatus
): boolean {
  if (!canTransitionPickupStatus(current, next)) return false;
  if (role === "admin" || role === "office") return true;
  if (role === "driver") return current === "assigned" && next === "completed";
  if (role === "portal") return current === "pending" && next === "cancelled";
  return false;
}

export function canDriverCompletePickup(input: {
  status: PickupRequestStatus;
  allVerified: boolean;
  hasSignature: boolean;
}): boolean {
  return (
    canRoleTransitionPickupStatus("driver", input.status, "completed") &&
    input.allVerified &&
    input.hasSignature
  );
}

export function canTransitionEstimateStatus(
  current: EstimateStatus,
  next: EstimateStatus
): boolean {
  const allowed = ESTIMATE_TRANSITIONS[current];
  if (!allowed) return false;
  return allowed.includes(next);
}

export function canRoleTransitionEstimateStatus(
  role: WorkflowRole,
  current: EstimateStatus,
  next: EstimateStatus
): boolean {
  if (!canTransitionEstimateStatus(current, next)) return false;
  if (role === "admin" || role === "office") return true;
  if (role === "portal") return current === "sent" && (next === "approved" || next === "rejected");
  return false;
}
