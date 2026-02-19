export interface DriverPickupRug {
  rugNumber: string;
  rugType: string;
  length: number;
  width: number;
  services: string[];
  verified: boolean;
  notes: string;
}

export interface DriverPickup {
  id: string;
  pickupId: string;
  clientName: string;
  clientAddress: string;
  date: string;
  rugs: DriverPickupRug[];
  status: "assigned" | "completed";
  completedAt?: string;
  signatureDataUrl?: string;
}

export const DRIVER_PICKUPS: DriverPickup[] = [
  {
    id: "dp-1",
    pickupId: "pk-1",
    clientName: "Pacific Rug Gallery",
    clientAddress: "3300 NW 23rd Ave, Portland",
    date: "2026-02-20",
    status: "assigned",
    rugs: [
      { rugNumber: "RB-1004", rugType: "Kilim", length: 5, width: 3, services: ["Standard Wash", "Fringe Repair"], verified: false, notes: "" },
      { rugNumber: "RB-1005", rugType: "Persian", length: 14, width: 10, services: ["Silk Treatment"], verified: false, notes: "" },
    ],
  },
  {
    id: "dp-2",
    pickupId: "pk-2",
    clientName: "Bella Casa Furnishings",
    clientAddress: "7100 SW Macadam Ave, Portland",
    date: "2026-02-25",
    status: "assigned",
    rugs: [
      { rugNumber: "RB-1010", rugType: "Turkish", length: 11, width: 8, services: ["Pet Stain Treatment", "Odor Removal"], verified: false, notes: "" },
    ],
  },
  {
    id: "dp-3",
    pickupId: "pk-0",
    clientName: "Riverside Interior Design",
    clientAddress: "1500 SE Water Ave, Portland",
    date: "2026-02-18",
    status: "completed",
    completedAt: "2026-02-18T14:34:00Z",
    signatureDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    rugs: [
      { rugNumber: "RB-0991", rugType: "Afghan", length: 9, width: 6, services: ["Deep Wash"], verified: true, notes: "" },
      { rugNumber: "RB-0992", rugType: "Persian", length: 7, width: 5, services: ["Standard Wash", "Scotchgard"], verified: true, notes: "Minor fraying on edge" },
      { rugNumber: "RB-0993", rugType: "Kilim", length: 4, width: 3, services: ["Standard Wash"], verified: true, notes: "" },
    ],
  },
];
