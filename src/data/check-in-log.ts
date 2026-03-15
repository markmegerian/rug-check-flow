export interface CheckInEntryService {
  id: string;
  name: string;
  price: number;
}

export interface CheckInEntry {
  id: string;
  rugNumber: string;
  clientName: string;
  rugType: string;
  length: number;
  width: number;
  services: CheckInEntryService[];
  totalPrice: number;
  checkedInAt: Date;
  checkedInBy: string;
}

export type UserRole = "checkin_staff" | "office" | "admin";

export function isEntryEditable(entry: CheckInEntry, role: UserRole): boolean {
  if (role === "admin" || role === "office") return true;
  return Date.now() - entry.checkedInAt.getTime() < 2 * 60 * 60 * 1000;
}

// Seed data for visual testing
const now = new Date();
function minutesAgo(m: number): Date {
  return new Date(now.getTime() - m * 60 * 1000);
}

export const SEED_CHECK_IN_LOG: CheckInEntry[] = [
  {
    id: "log-1",
    rugNumber: "R-4510",
    clientName: "Acme Corp",
    rugType: "Persian",
    length: 8,
    width: 10,
    services: [
      { id: "wash-standard", name: "Standard Wash", price: 280 },
      { id: "protect-scotch", name: "Scotchgard", price: 120 },
    ],
    totalPrice: 400,
    checkedInAt: minutesAgo(22),
    checkedInBy: "Staff",
  },
  {
    id: "log-2",
    rugNumber: "R-4508",
    clientName: "Desert Rug Gallery",
    rugType: "Turkish",
    length: 6,
    width: 9,
    services: [
      { id: "wash-deep", name: "Deep Wash", price: 270 },
    ],
    totalPrice: 270,
    checkedInAt: minutesAgo(47),
    checkedInBy: "Staff",
  },
  {
    id: "log-3",
    rugNumber: "R-4501",
    clientName: "Acme Corp",
    rugType: "Oriental",
    length: 5,
    width: 7,
    services: [
      { id: "wash-pet", name: "Pet Stain Treatment", price: 140 },
      { id: "wash-odor", name: "Odor Removal", price: 87.5 },
    ],
    totalPrice: 227.5,
    checkedInAt: minutesAgo(95),
    checkedInBy: "Staff",
  },
];
