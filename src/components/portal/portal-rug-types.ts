import type { Enums } from "@/integrations/supabase/types";

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
  notes: string | null;
  photo_url: string | null;
};

export type EstimateRow = {
  id: string;
  rug_id: string;
  estimate_number: string;
  status: string;
  total: number;
  created_at?: string;
};

export type RugEstimateSummary = {
  estimateNumber: string;
  status: string;
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
  service_category: string;
};

export const STATUS_LABELS: Record<string, string> = {
  checked_in: "Checked In",
  in_production: "In Production",
  ready: "Ready for Pickup",
  picked_up: "Delivered",
};

export const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  checked_in: "outline",
  in_production: "default",
  ready: "secondary",
  picked_up: "outline",
};

export const ACTIVE_STATUSES: RugStatus[] = ["checked_in", "in_production", "ready"];

export const PROGRESS_STEPS: RugStatus[] = ["checked_in", "in_production", "ready"];

export function isCleaningLineItem(category: string | null | undefined): boolean {
  return category?.toLowerCase() === "cleaning";
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
