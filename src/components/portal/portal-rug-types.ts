import type { Enums } from "@/integrations/supabase/types";
import type { EstimateStatus } from "@/lib/workflow-guards";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RugStatus = Enums<"rug_status">;

export type RugRow = {
  id: string;
  tag: string;
  description: string;
  services: string[];
  size_length: number | null;
  size_width: number | null;
  checked_in_at: string;
  status: RugStatus;
  notes: string;
  photo_url: string | null;
};

export type EstimateRow = {
  id: string;
  rug_id: string;
  estimate_number: string;
  status: EstimateStatus;
  total: number;
};

export type EstimateItemRow = {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  client_approved: boolean | null;
  client_decision_at: string | null;
  service_category: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STATUS_LABELS: Record<RugStatus, string> = {
  checked_in: "Checked In",
  in_production: "In Production",
  ready: "Ready for Pickup",
  picked_up: "Delivered",
};

export const STATUS_VARIANTS: Record<RugStatus, "default" | "secondary" | "outline"> = {
  checked_in: "default",
  in_production: "default",
  ready: "secondary",
  picked_up: "outline",
};

export const ACTIVE_STATUSES: RugStatus[] = ["checked_in", "in_production", "ready"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isCleaningLineItem(item: EstimateItemRow): boolean {
  return item.service_category?.toLowerCase() === "cleaning";
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
