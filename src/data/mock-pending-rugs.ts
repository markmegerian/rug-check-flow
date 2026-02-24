export interface PendingRug {
  id: string;
  rugNumber: string;
  clientName: string;
  rugType?: string;
  length?: number;
  width?: number;
  requestedServices: string[];
  source: "pickup" | "walkin";
  pickupRequestId?: string;
  pickupRequestItemId?: string;
  pickupDate?: string;
}

export const MOCK_CLIENTS = [
  "Acme Corp",
  "Desert Rug Gallery",
  "Silk Road Imports",
  "Mountain Home Interiors",
  "Coastal Living Design",
];

export const MOCK_PENDING_RUGS: PendingRug[] = [
  {
    id: "pr-1",
    rugNumber: "R-4521",
    clientName: "Acme Corp",
    rugType: "Persian",
    length: 8,
    width: 10,
    requestedServices: ["Standard Wash", "Scotchgard"],
    source: "pickup",
  },
  {
    id: "pr-2",
    rugNumber: "R-4522",
    clientName: "Acme Corp",
    rugType: "Oriental",
    length: 6,
    width: 9,
    requestedServices: ["Deep Wash"],
    source: "pickup",
  },
  {
    id: "pr-3",
    rugNumber: "R-4523",
    clientName: "Acme Corp",
    rugType: undefined,
    length: 4,
    width: 6,
    requestedServices: ["Pet Stain Treatment", "Odor Removal"],
    source: "pickup",
  },
  {
    id: "pr-4",
    rugNumber: "R-4530",
    clientName: "Desert Rug Gallery",
    rugType: "Turkish",
    length: 12,
    width: 15,
    requestedServices: ["Standard Wash", "Fringe Repair"],
    source: "pickup",
  },
  {
    id: "pr-5",
    rugNumber: "R-4531",
    clientName: "Desert Rug Gallery",
    rugType: "Kilim",
    length: 3,
    width: 5,
    requestedServices: ["Standard Wash"],
    source: "pickup",
  },
  {
    id: "pr-6",
    rugNumber: "R-4540",
    clientName: "Silk Road Imports",
    rugType: "Afghan",
    length: 9,
    width: 12,
    requestedServices: ["Deep Wash", "Moth Proofing", "Scotchgard"],
    source: "pickup",
  },
  {
    id: "pr-7",
    rugNumber: "R-4541",
    clientName: "Silk Road Imports",
    rugType: "Persian",
    length: 5,
    width: 7,
    requestedServices: ["Silk Treatment"],
    source: "pickup",
  },
  {
    id: "pr-8",
    rugNumber: "R-4550",
    clientName: "Mountain Home Interiors",
    rugType: "Shag",
    length: 8,
    width: 10,
    requestedServices: ["Standard Wash", "Pet Stain Treatment"],
    source: "pickup",
  },
];
