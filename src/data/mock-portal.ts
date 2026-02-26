export type PortalStatus = "in_progress" | "ready" | "delivered";

export interface PortalRug {
  id: string;
  rugNumber: string;
  rugType: string;
  length: number;
  width: number;
  services: string[];
  status: PortalStatus;
  checkedInDate: string;
}

export interface PickupRugEntry {
  id: string;
  label: string;
  rugType: string;
  length: number;
  width: number;
  estimateRequested?: boolean;
  estimateDetails?: string;
}

export interface PortalPickup {
  id: string;
  date: string;
  routeDay: string;
  region: string;
  rugNumbers: string[];
  newRugs: PickupRugEntry[];
  status: "pending" | "confirmed";
  notes?: string;
  knownRugEstimateRequests?: Record<string, { requested: boolean; details: string }>;
}

export const PORTAL_RUGS: PortalRug[] = [
  { id: "pr-1", rugNumber: "RB-1001", rugType: "Persian", length: 10, width: 8, services: ["Deep Wash", "Scotchgard"], status: "in_progress", checkedInDate: "2026-02-17" },
  { id: "pr-2", rugNumber: "RB-1002", rugType: "Turkish", length: 12, width: 9, services: ["Standard Wash"], status: "in_progress", checkedInDate: "2026-02-16" },
  { id: "pr-3", rugNumber: "RB-1003", rugType: "Oriental", length: 6, width: 4, services: ["Deep Wash", "Moth Proofing"], status: "in_progress", checkedInDate: "2026-02-15" },
  { id: "pr-4", rugNumber: "RB-1004", rugType: "Kilim", length: 5, width: 3, services: ["Standard Wash", "Fringe Repair"], status: "ready", checkedInDate: "2026-02-14" },
  { id: "pr-5", rugNumber: "RB-1005", rugType: "Persian", length: 14, width: 10, services: ["Silk Treatment"], status: "ready", checkedInDate: "2026-02-13" },
  { id: "pr-6", rugNumber: "RB-1006", rugType: "Moroccan", length: 8, width: 5, services: ["Standard Wash", "Edge Binding"], status: "in_progress", checkedInDate: "2026-02-12" },
  { id: "pr-7", rugNumber: "RB-1007", rugType: "Afghan", length: 9, width: 6, services: ["Antique Restoration", "Scotchgard"], status: "delivered", checkedInDate: "2026-02-10" },
  { id: "pr-8", rugNumber: "RB-1008", rugType: "Persian", length: 7, width: 5, services: ["Deep Wash"], status: "delivered", checkedInDate: "2026-02-08" },
  { id: "pr-9", rugNumber: "RB-1009", rugType: "Kilim", length: 4, width: 3, services: ["Standard Wash"], status: "delivered", checkedInDate: "2026-02-06" },
  { id: "pr-10", rugNumber: "RB-1010", rugType: "Turkish", length: 11, width: 8, services: ["Pet Stain Treatment", "Odor Removal"], status: "ready", checkedInDate: "2026-02-11" },
];

export const PORTAL_PICKUPS: PortalPickup[] = [
  { id: "pk-1", date: "2026-02-20", routeDay: "Thursday", region: "Westchester", rugNumbers: ["RB-1004", "RB-1005"], newRugs: [], status: "pending", notes: "Please call before arriving" },
  { id: "pk-2", date: "2026-02-25", routeDay: "Thursday", region: "Westchester", rugNumbers: ["RB-1010"], newRugs: [{ id: "nr-1", label: "Living Room Rug", rugType: "Persian", length: 12, width: 9 }], status: "confirmed" },
];
