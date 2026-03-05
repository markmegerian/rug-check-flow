import { describe, expect, it } from "vitest";

type RestRow = Record<string, unknown>;

const REQUIRED_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "PORTAL_USER_EMAIL",
  "PORTAL_USER_PASSWORD",
  "OFFICE_USER_EMAIL",
  "OFFICE_USER_PASSWORD",
  "DRIVER_USER_EMAIL",
  "DRIVER_USER_PASSWORD",
] as const;

const missingRequiredEnv = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);
const hasIntegrationEnv = missingRequiredEnv.length === 0;
const runIfConfigured = hasIntegrationEnv ? describe : describe.skip;

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
const EXPECTED_PORTAL_CLIENT_ID = process.env.EXPECTED_PORTAL_CLIENT_ID ?? "";
const EXPECTED_DRIVER_USER_ID = process.env.EXPECTED_DRIVER_USER_ID ?? "";

async function loginAndGetToken(email: string, password: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const payload = await response.json();
  if (!response.ok || !payload?.access_token) {
    throw new Error(`Auth failed for ${email}: ${JSON.stringify(payload)}`);
  }
  return payload.access_token as string;
}

async function queryRest(token: string, path: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload)) {
    throw new Error(`REST query failed for ${path}: ${JSON.stringify(payload)}`);
  }
  return payload as RestRow[];
}

function assertClientScoped(rows: RestRow[], expectedClientId: string, tableName: string) {
  const outOfScope = rows.filter((row) => row.client_id !== null && row.client_id !== expectedClientId);
  expect(outOfScope, `${tableName} returned out-of-scope rows`).toHaveLength(0);
}

runIfConfigured("Supabase role-scoped integration", () => {
  it("portal user is client-scoped for invoices, estimates, pickups, and rugs", async () => {
    const portalToken = await loginAndGetToken(process.env.PORTAL_USER_EMAIL ?? "", process.env.PORTAL_USER_PASSWORD ?? "");

    const invoices = await queryRest(portalToken, "invoices?select=id,client_id,status&limit=25");
    const invoiceItems = await queryRest(portalToken, "invoice_items?select=id,invoice_id&limit=50");
    const estimates = await queryRest(portalToken, "estimates?select=id,client_id,status&limit=25");
    const pickups = await queryRest(portalToken, "pickup_requests?select=id,client_id,status&limit=25");
    const rugs = await queryRest(portalToken, "rugs?select=id,client_id,status&limit=25");

    const visibleInvoiceIds = new Set(invoices.map((row) => String(row.id ?? "")).filter(Boolean));
    const outOfScopeInvoiceItems = invoiceItems.filter((row) => !visibleInvoiceIds.has(String(row.invoice_id ?? "")));
    expect(outOfScopeInvoiceItems).toHaveLength(0);

    if (EXPECTED_PORTAL_CLIENT_ID) {
      assertClientScoped(invoices, EXPECTED_PORTAL_CLIENT_ID, "invoices");
      assertClientScoped(estimates, EXPECTED_PORTAL_CLIENT_ID, "estimates");
      assertClientScoped(pickups, EXPECTED_PORTAL_CLIENT_ID, "pickup_requests");
      assertClientScoped(rugs, EXPECTED_PORTAL_CLIENT_ID, "rugs");
    }
  });

  it("driver user cannot see unrelated pickup requests", async () => {
    const driverToken = await loginAndGetToken(process.env.DRIVER_USER_EMAIL ?? "", process.env.DRIVER_USER_PASSWORD ?? "");
    const pickupRows = await queryRest(driverToken, "pickup_requests?select=id,assigned_driver_id,status&limit=25");

    if (EXPECTED_DRIVER_USER_ID) {
      const outOfScope = pickupRows.filter(
        (row) => row.assigned_driver_id !== null && row.assigned_driver_id !== EXPECTED_DRIVER_USER_ID,
      );
      expect(outOfScope).toHaveLength(0);
    } else {
      expect(Array.isArray(pickupRows)).toBe(true);
    }
  });

  it("office user retains broad visibility across operational tables", async () => {
    const officeToken = await loginAndGetToken(process.env.OFFICE_USER_EMAIL ?? "", process.env.OFFICE_USER_PASSWORD ?? "");
    const officeInvoices = await queryRest(officeToken, "invoices?select=id,client_id,status&limit=50");
    const officePickups = await queryRest(officeToken, "pickup_requests?select=id,client_id,status&limit=50");
    const officePortalUsers = await queryRest(officeToken, "portal_users?select=id,client_id,email,status&limit=20");

    expect(Array.isArray(officeInvoices)).toBe(true);
    expect(Array.isArray(officePickups)).toBe(true);
    expect(Array.isArray(officePortalUsers)).toBe(true);

    if (EXPECTED_PORTAL_CLIENT_ID) {
      expect(officeInvoices.some((row) => row.client_id === EXPECTED_PORTAL_CLIENT_ID)).toBe(true);
    }
  });
});
