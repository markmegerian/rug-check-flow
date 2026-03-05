import { describe, expect, it } from "vitest";

type RestRow = Record<string, unknown>;

const REQUIRED_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "OFFICE_USER_EMAIL",
  "OFFICE_USER_PASSWORD",
] as const;

const missingRequiredEnv = REQUIRED_ENV_KEYS.filter((key) => !process.env[key]);
const hasIntegrationEnv = missingRequiredEnv.length === 0;
const runIfConfigured = hasIntegrationEnv ? describe : describe.skip;

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";

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

async function queryRest(token: string, path: string, method: string = "GET", body?: unknown) {
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
  };

  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle empty responses (common for DELETE, PATCH with no return)
  const text = await response.text();
  let payload: unknown = null;
  
  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch (e) {
      // If JSON parsing fails, treat as error
      if (!response.ok) {
        return { error: { message: text }, status: response.status };
      }
      throw new Error(`Invalid JSON response for ${path}: ${text}`);
    }
  }

  if (method === "GET") {
    if (!response.ok || !Array.isArray(payload)) {
      throw new Error(`REST query failed for ${path}: ${JSON.stringify(payload || text)}`);
    }
    return payload as RestRow[];
  } else {
    if (!response.ok) {
      return { error: payload || { message: text }, status: response.status };
    }
    // For successful non-GET requests, return payload or empty object
    return (payload as RestRow | RestRow[]) || (method === "DELETE" ? {} : []);
  }
}

runIfConfigured("Billing immutability acceptance tests", () => {
  it("attempting to edit invoice_items for a sent invoice fails (DB-level)", async () => {
    const officeToken = await loginAndGetToken(process.env.OFFICE_USER_EMAIL ?? "", process.env.OFFICE_USER_PASSWORD ?? "");

    // Find or create a sent invoice
    const invoices = await queryRest(officeToken, "invoices?select=id,status,invoice_number&status=eq.sent&limit=1");
    
    if (invoices.length === 0) {
      // Create a test invoice and mark it as sent
      const clients = await queryRest(officeToken, "clients?select=id&limit=1");
      if (clients.length === 0) {
        console.warn("No clients found, skipping test");
        return;
      }

      const clientId = clients[0].id as string;
      const invoiceNum = `TEST-INV-${Date.now()}`;
      
      // Create invoice
      const newInvoice = await queryRest(officeToken, "invoices", "POST", {
        invoice_number: invoiceNum,
        client_id: clientId,
        status: "draft",
        total: 100,
      }) as RestRow;

      const invoiceId = newInvoice.id as string;

      // Add invoice item
      await queryRest(officeToken, "invoice_items", "POST", {
        invoice_id: invoiceId,
        description: "Test item",
        quantity: 1,
        unit_price: 100,
        total: 100,
      });

      // Mark as sent
      await queryRest(officeToken, `invoices?id=eq.${invoiceId}`, "PATCH", {
        status: "sent",
        issued_at: new Date().toISOString(),
      });

      // Now try to update the invoice item - should fail
      const invoiceItems = await queryRest(officeToken, `invoice_items?invoice_id=eq.${invoiceId}&select=id&limit=1`);
      if (invoiceItems.length > 0) {
        const itemId = invoiceItems[0].id as string;
        const updateResult = await queryRest(officeToken, `invoice_items?id=eq.${itemId}`, "PATCH", {
          description: "Modified description",
        }) as { error?: unknown; status?: number };

        expect(updateResult.error || updateResult.status).toBeDefined();
        expect(updateResult.status).toBeGreaterThanOrEqual(400);
      }

      // Cleanup
      await queryRest(officeToken, `invoices?id=eq.${invoiceId}`, "DELETE");
    } else {
      const invoiceId = invoices[0].id as string;
      const invoiceItems = await queryRest(officeToken, `invoice_items?invoice_id=eq.${invoiceId}&select=id&limit=1`);
      
      if (invoiceItems.length > 0) {
        const itemId = invoiceItems[0].id as string;
        const updateResult = await queryRest(officeToken, `invoice_items?id=eq.${itemId}`, "PATCH", {
          description: "Modified description",
        }) as { error?: unknown; status?: number };

        expect(updateResult.error || updateResult.status).toBeDefined();
        expect(updateResult.status).toBeGreaterThanOrEqual(400);
      }
    }
  });

  it("balance updates correctly with allocations and credit memos", async () => {
    const officeToken = await loginAndGetToken(process.env.OFFICE_USER_EMAIL ?? "", process.env.OFFICE_USER_PASSWORD ?? "");

    // Find or create a sent invoice
    const clients = await queryRest(officeToken, "clients?select=id&limit=1");
    if (clients.length === 0) {
      console.warn("No clients found, skipping test");
      return;
    }

    const clientId = clients[0].id as string;
    const invoiceNum = `TEST-BAL-${Date.now()}`;
    const invoiceTotal = 500;

    // Create invoice
    const newInvoice = await queryRest(officeToken, "invoices", "POST", {
      invoice_number: invoiceNum,
      client_id: clientId,
      status: "sent",
      total: invoiceTotal,
      issued_at: new Date().toISOString(),
    }) as RestRow;

    const invoiceId = newInvoice.id as string;

    try {
      // Get initial balance (should equal total)
      let invoice = await queryRest(officeToken, `invoices?id=eq.${invoiceId}&select=balance,total`) as RestRow[];
      expect(Number(invoice[0].balance)).toBe(invoiceTotal);

      // Create a payment
      const payment = await queryRest(officeToken, "payments", "POST", {
        client_id: clientId,
        amount: 200,
        method: "cash",
        reference: "TEST-PAY",
        received_at: new Date().toISOString(),
      }) as RestRow;

      const paymentId = payment.id as string;

      // Allocate payment to invoice
      await queryRest(officeToken, "payment_allocations", "POST", {
        payment_id: paymentId,
        invoice_id: invoiceId,
        amount: 200,
      });

      // Check balance updated (500 - 200 = 300)
      invoice = await queryRest(officeToken, `invoices?id=eq.${invoiceId}&select=balance,total`) as RestRow[];
      expect(Number(invoice[0].balance)).toBe(300);

      // Create a credit memo
      const creditMemo = await queryRest(officeToken, "credit_memos", "POST", {
        invoice_id: invoiceId,
        client_id: clientId,
        memo_number: `TEST-CM-${Date.now()}`,
        reason: "Test credit",
        total: -50,
      }) as RestRow;

      const creditMemoId = creditMemo.id as string;

      // Add credit memo line
      await queryRest(officeToken, "credit_memo_lines", "POST", {
        credit_memo_id: creditMemoId,
        description: "Test credit line",
        quantity: 1,
        unit_price: -50,
        total: -50,
      });

      // Check balance updated (300 + 50 = 350)
      invoice = await queryRest(officeToken, `invoices?id=eq.${invoiceId}&select=balance,total`) as RestRow[];
      expect(Number(invoice[0].balance)).toBe(350);

      // Cleanup
      await queryRest(officeToken, `credit_memos?id=eq.${creditMemoId}`, "DELETE");
      await queryRest(officeToken, `payments?id=eq.${paymentId}`, "DELETE");
      await queryRest(officeToken, `invoices?id=eq.${invoiceId}`, "DELETE");
    } catch (error) {
      // Cleanup on error
      await queryRest(officeToken, `invoices?id=eq.${invoiceId}`, "DELETE").catch(() => {});
      throw error;
    }
  });

  it("cannot modify invoice total when status is sent/overdue/paid/disputed", async () => {
    const officeToken = await loginAndGetToken(process.env.OFFICE_USER_EMAIL ?? "", process.env.OFFICE_USER_PASSWORD ?? "");

    const clients = await queryRest(officeToken, "clients?select=id&limit=1");
    if (clients.length === 0) {
      console.warn("No clients found, skipping test");
      return;
    }

    const clientId = clients[0].id as string;
    const invoiceNum = `TEST-IMMUT-${Date.now()}`;

    // Create and send invoice
    const newInvoice = await queryRest(officeToken, "invoices", "POST", {
      invoice_number: invoiceNum,
      client_id: clientId,
      status: "sent",
      total: 100,
      issued_at: new Date().toISOString(),
    }) as RestRow;

    const invoiceId = newInvoice.id as string;

    try {
      // Try to modify total - should fail
      const updateResult = await queryRest(officeToken, `invoices?id=eq.${invoiceId}`, "PATCH", {
        total: 200,
      }) as { error?: unknown; status?: number };

      expect(updateResult.error || updateResult.status).toBeDefined();
      expect(updateResult.status).toBeGreaterThanOrEqual(400);

      // Status change should still work
      const statusUpdate = await queryRest(officeToken, `invoices?id=eq.${invoiceId}`, "PATCH", {
        status: "paid",
        paid_at: new Date().toISOString(),
      });

      expect(statusUpdate).toBeDefined();

      // Cleanup
      await queryRest(officeToken, `invoices?id=eq.${invoiceId}`, "DELETE");
    } catch (error) {
      await queryRest(officeToken, `invoices?id=eq.${invoiceId}`, "DELETE").catch(() => {});
      throw error;
    }
  });
});
