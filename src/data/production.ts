export type ProductionStage =
  | "checked_in"
  | "in_progress"
  | "qc"
  | "ready"
  | "out_for_delivery";

export const PRODUCTION_STAGES: {
  id: ProductionStage;
  label: string;
  color: string;
}[] = [
  { id: "checked_in", label: "Checked In", color: "bg-muted" },
  { id: "in_progress", label: "In Progress", color: "bg-blue-500/10" },
  { id: "qc", label: "QC", color: "bg-amber-500/10" },
  { id: "ready", label: "Ready", color: "bg-green-500/10" },
  { id: "out_for_delivery", label: "Out for Delivery", color: "bg-purple-500/10" },
];

export type ServiceStatus = "pending" | "in_progress" | "complete";

export interface ServiceTask {
  id: string;
  name: string;
  status: ServiceStatus;
  assignedTo: string | null;
}

export interface ProductionRug {
  id: string;
  rugNumber: string;
  clientName: string;
  rugType: string;
  length: number;
  width: number;
  stage: ProductionStage;
  services: ServiceTask[];
  checkedInAt: Date;
}

export const STAFF_MEMBERS = ["Alex", "Jordan", "Sam", "Riley"] as const;

export const currentStaffName = "Alex";

export const SEED_PRODUCTION_RUGS: ProductionRug[] = [
  {
    id: "prod-1",
    rugNumber: "R-4501",
    clientName: "Acme Corp",
    rugType: "Persian",
    length: 10,
    width: 8,
    stage: "checked_in",
    services: [
      { id: "s1", name: "Deep Wash", status: "pending", assignedTo: "Alex" },
      { id: "s2", name: "Fringe Repair", status: "pending", assignedTo: "Jordan" },
    ],
    checkedInAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: "prod-2",
    rugNumber: "R-4502",
    clientName: "Desert Rug Gallery",
    rugType: "Turkish",
    length: 12,
    width: 9,
    stage: "checked_in",
    services: [
      { id: "s3", name: "Standard Wash", status: "pending", assignedTo: "Alex" },
      { id: "s4", name: "Scotchgard", status: "pending", assignedTo: "Alex" },
    ],
    checkedInAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
  },
  {
    id: "prod-3",
    rugNumber: "R-4489",
    clientName: "Sunrise Interiors",
    rugType: "Oriental",
    length: 6,
    width: 4,
    stage: "in_progress",
    services: [
      { id: "s5", name: "Pet Stain Treatment", status: "in_progress", assignedTo: "Alex" },
      { id: "s6", name: "Odor Removal", status: "pending", assignedTo: "Sam" },
    ],
    checkedInAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
  {
    id: "prod-4",
    rugNumber: "R-4475",
    clientName: "Goldstein Residence",
    rugType: "Moroccan",
    length: 8,
    width: 5,
    stage: "in_progress",
    services: [
      { id: "s7", name: "Deep Wash", status: "complete", assignedTo: "Jordan" },
      { id: "s8", name: "Edge Binding", status: "in_progress", assignedTo: "Alex" },
    ],
    checkedInAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
  },
  {
    id: "prod-5",
    rugNumber: "R-4460",
    clientName: "Park Avenue Hotel",
    rugType: "Persian",
    length: 14,
    width: 10,
    stage: "qc",
    services: [
      { id: "s9", name: "Silk Treatment", status: "complete", assignedTo: "Sam" },
      { id: "s10", name: "Moth Proofing", status: "complete", assignedTo: "Alex" },
    ],
    checkedInAt: new Date(Date.now() - 72 * 60 * 60 * 1000),
  },
  {
    id: "prod-6",
    rugNumber: "R-4442",
    clientName: "Bella Casa Design",
    rugType: "Kilim",
    length: 5,
    width: 3,
    stage: "ready",
    services: [
      { id: "s11", name: "Standard Wash", status: "complete", assignedTo: "Riley" },
    ],
    checkedInAt: new Date(Date.now() - 96 * 60 * 60 * 1000),
  },
  {
    id: "prod-7",
    rugNumber: "R-4430",
    clientName: "Thompson Estate",
    rugType: "Afghan",
    length: 9,
    width: 6,
    stage: "out_for_delivery",
    services: [
      { id: "s12", name: "Antique Restoration", status: "complete", assignedTo: "Jordan" },
      { id: "s13", name: "Scotchgard", status: "complete", assignedTo: "Alex" },
    ],
    checkedInAt: new Date(Date.now() - 120 * 60 * 60 * 1000),
  },
];
