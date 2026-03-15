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
