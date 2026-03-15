export type ProductionStage = "checked_in" | "in_production" | "ready" | "picked_up";

export const PRODUCTION_STAGES: {
  id: ProductionStage;
  label: string;
}[] = [
  { id: "checked_in", label: "Checked In" },
  { id: "in_production", label: "In Production" },
  { id: "ready", label: "Ready" },
  { id: "picked_up", label: "Picked Up" },
];
