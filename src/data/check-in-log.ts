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

/**
 * Map an authenticated user's AppRole list to the highest-privilege UserRole
 * for check-in editability. Drivers are treated as checkin_staff.
 */
export function deriveUserRole(roles: readonly string[]): UserRole {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("office")) return "office";
  return "checkin_staff";
}

export function isEntryEditable(entry: CheckInEntry, role: UserRole): boolean {
  if (role === "admin" || role === "office") return true;
  return Date.now() - entry.checkedInAt.getTime() < 2 * 60 * 60 * 1000;
}

