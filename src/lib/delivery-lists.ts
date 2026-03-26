export const DELIVERY_LIST_ELIGIBLE_RUG_STATUSES = ["checked_in", "in_production", "ready"] as const;

export function shouldPromoteRugToReadyForDelivery(status: string | null | undefined) {
  return status === "checked_in" || status === "in_production";
}
