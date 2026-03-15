export interface Service {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  unit: "sqft" | "flat";
}

export interface ServicePreset {
  id: string;
  name: string;
  serviceIds: string[];
}

export const SERVICE_CATEGORIES = [
  "Cleaning",
  "Repair",
  "Protection",
  "Specialty",
] as const;

export const SERVICES: Service[] = [
  // Cleaning
  { id: "wash-standard", name: "Standard Wash", category: "Cleaning", basePrice: 3.5, unit: "sqft" },
  { id: "wash-deep", name: "Deep Wash", category: "Cleaning", basePrice: 5.0, unit: "sqft" },
  { id: "wash-pet", name: "Pet Stain Treatment", category: "Cleaning", basePrice: 4.0, unit: "sqft" },
  { id: "wash-odor", name: "Odor Removal", category: "Cleaning", basePrice: 2.5, unit: "sqft" },
  // Repair
  { id: "repair-fringe", name: "Fringe Repair", category: "Repair", basePrice: 45, unit: "flat" },
  { id: "repair-binding", name: "Edge Binding", category: "Repair", basePrice: 8, unit: "flat" },
  { id: "repair-patch", name: "Patch Repair", category: "Repair", basePrice: 75, unit: "flat" },
  // Protection
  { id: "protect-scotch", name: "Scotchgard", category: "Protection", basePrice: 2.0, unit: "sqft" },
  { id: "protect-moth", name: "Moth Proofing", category: "Protection", basePrice: 1.5, unit: "sqft" },
  // Specialty
  { id: "spec-silk", name: "Silk Treatment", category: "Specialty", basePrice: 8.0, unit: "sqft" },
  { id: "spec-antique", name: "Antique Restoration", category: "Specialty", basePrice: 12.0, unit: "sqft" },
];

export const SERVICE_PRESETS: ServicePreset[] = [
  { id: "preset-basic", name: "Basic Clean", serviceIds: ["wash-standard"] },
  { id: "preset-full", name: "Full Service", serviceIds: ["wash-deep", "protect-scotch"] },
  { id: "preset-pet", name: "Pet Owner Package", serviceIds: ["wash-pet", "wash-odor", "protect-scotch"] },
];

export const RUG_TYPES = [
  "Persian",
  "Oriental",
  "Turkish",
  "Moroccan",
  "Indian",
  "Chinese",
  "Tibetan",
  "Afghan",
  "Kilim",
  "Shag",
  "Braided",
  "Synthetic",
  "Other",
] as const;
