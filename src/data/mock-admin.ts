export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "office" | "checkin_staff" | "driver";
  status: "active" | "invited";
}

export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  userName: string;
  action: string;
}

export const MOCK_ADMIN_USERS: AdminUser[] = [
  { id: "u-1", name: "Sarah Chen", email: "sarah@riversideinteriors.com", role: "office", status: "active" },
  { id: "u-2", name: "Amir Farouk", email: "amir@pacificrugs.com", role: "admin", status: "active" },
  { id: "u-3", name: "Tom Whitfield", email: "tom@grandmasrugs.com", role: "checkin_staff", status: "active" },
  { id: "u-4", name: "Driver Mike", email: "mike@rugboost.com", role: "driver", status: "active" },
  { id: "u-5", name: "New Hire", email: "newhire@rugboost.com", role: "checkin_staff", status: "invited" },
];

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  { id: "admin", name: "admin", description: "Full system access" },
  { id: "office", name: "office", description: "Office & billing access" },
  { id: "checkin_staff", name: "checkin_staff", description: "Check-in only" },
  { id: "driver", name: "driver", description: "Driver portal only" },
];

const now = new Date();
function minutesAgo(m: number): Date {
  return new Date(now.getTime() - m * 60 * 1000);
}

export const MOCK_AUDIT_LOG: AuditEntry[] = [
  { id: "a-1", timestamp: minutesAgo(5), userName: "Amir Farouk", action: "Completed pickup dp-1" },
  { id: "a-2", timestamp: minutesAgo(25), userName: "Sarah Chen", action: "Checked in R-4510" },
  { id: "a-3", timestamp: minutesAgo(50), userName: "Sarah Chen", action: "Updated client-3 contact info" },
  { id: "a-4", timestamp: minutesAgo(80), userName: "System", action: "Generated invoice INV-2026-001" },
  { id: "a-5", timestamp: minutesAgo(120), userName: "Tom Whitfield", action: "Checked in R-4508" },
  { id: "a-6", timestamp: minutesAgo(180), userName: "Amir Farouk", action: "Added user newhire@rugboost.com" },
  { id: "a-7", timestamp: minutesAgo(240), userName: "System", action: "Pickup dp-2 scheduled for Feb 25" },
  { id: "a-8", timestamp: minutesAgo(300), userName: "Driver Mike", action: "Completed pickup dp-3" },
];
