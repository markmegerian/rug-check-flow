export const FACILITY_ROUTES = [
  "/facility/checkin",
  "/facility/production",
  "/facility/delivery-prep",
  "/facility/invoices",
] as const;

export const OFFICE_ROUTES = [
  "/office/clients",
  "/office/jobs",
  "/office/estimates",
  "/office/inbox",
  "/office/pricing",
] as const;

export const LOGISTICS_ROUTES = [
  "/logistics/deliveries",
  "/logistics/routes",
  "/logistics/proofs",
  "/driver",
] as const;

export const FINANCE_ROUTES = [
  "/finance/invoices",
  "/finance/payments",
  "/finance/credits",
  "/finance/collections",
] as const;

export const PORTAL_ROUTES = [
  "/portal/rugs",
  "/portal/pickups",
  "/portal/estimates",
  "/portal/invoices",
  "/portal/messages",
  "/portal/prices",
] as const;

export type LegacyOpsTab =
  | "production"
  | "delivery-prep"
  | "invoice-generator"
  | "pricing"
  | "accounts-receivable"
  | "estimates"
  | "clients"
  | "jobs"
  | "inbox"
  | "deliveries"
  | "routes"
  | "proofs"
  | "checkin";

export type LegacyPortalTab =
  | "rugs"
  | "pickups"
  | "estimates"
  | "invoices"
  | "messages"
  | "prices";

export const LEGACY_OPS_TAB_REDIRECTS: Record<LegacyOpsTab, string> = {
  checkin: "/facility/checkin",
  production: "/facility/production",
  "delivery-prep": "/facility/delivery-prep",
  "invoice-generator": "/facility/invoices",
  pricing: "/office/pricing",
  estimates: "/office/estimates",
  clients: "/office/clients",
  jobs: "/office/jobs",
  inbox: "/office/inbox",
  deliveries: "/logistics/deliveries",
  routes: "/logistics/routes",
  proofs: "/logistics/proofs",
  "accounts-receivable": "/finance/invoices",
};

export const LEGACY_PORTAL_TAB_REDIRECTS: Record<LegacyPortalTab, string> = {
  rugs: "/portal/rugs",
  pickups: "/portal/pickups",
  estimates: "/portal/estimates",
  invoices: "/portal/invoices",
  messages: "/portal/messages",
  prices: "/portal/prices",
};

export function isFacilityPath(pathname: string) {
  return pathname.startsWith("/facility");
}

export function isOfficePath(pathname: string) {
  return pathname.startsWith("/office");
}

export function isLogisticsPath(pathname: string) {
  return pathname.startsWith("/logistics") || pathname.startsWith("/driver");
}

export function isFinancePath(pathname: string) {
  return pathname.startsWith("/finance");
}

export function isPortalPath(pathname: string) {
  return pathname.startsWith("/portal");
}
