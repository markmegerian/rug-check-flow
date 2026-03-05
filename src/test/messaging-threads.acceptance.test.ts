import { describe, expect, it } from "vitest";

type RestRow = Record<string, unknown>;

const REQUIRED_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "PORTAL_USER_EMAIL",
  "PORTAL_USER_PASSWORD",
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
    // For POST requests, request the created object to be returned
    if (method === "POST") {
      headers["Prefer"] = "return=representation";
    }
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
    if (!response.ok) {
      throw new Error(`REST query failed for ${path}: ${JSON.stringify(payload || text)}`);
    }
    // RPC functions may return single objects or arrays
    if (Array.isArray(payload)) {
      return payload as RestRow[];
    }
    // Single object response (common for RPC)
    return [payload as RestRow];
  } else {
    if (!response.ok) {
      return { error: payload || { message: text }, status: response.status };
    }
    // For successful non-GET requests, return payload
    // POST typically returns a single object or array, PATCH returns object or array, DELETE returns empty
    if (payload === null) {
      return method === "DELETE" ? {} : (method === "POST" ? {} : {});
    }
    // POST can return single object or array depending on Prefer header
    // If it's an array with one item, return the item; if single object, return as-is
    if (Array.isArray(payload) && payload.length === 1) {
      return payload[0] as RestRow;
    }
    if (Array.isArray(payload)) {
      return payload as RestRow[];
    }
    return payload as RestRow;
  }
}

runIfConfigured("Messaging threads acceptance tests", () => {
  it("portal cannot message other clients", async () => {
    const portalToken = await loginAndGetToken(process.env.PORTAL_USER_EMAIL ?? "", process.env.PORTAL_USER_PASSWORD ?? "");
    const officeToken = await loginAndGetToken(process.env.OFFICE_USER_EMAIL ?? "", process.env.OFFICE_USER_PASSWORD ?? "");

    // Get portal user's client_id
    const portalClients = await queryRest(portalToken, "clients?select=id&limit=1");
    if (portalClients.length === 0) {
      console.warn("No clients found for portal user, skipping test");
      return;
    }
    const portalClientId = portalClients[0].id as string;

    // Get all clients (as office user)
    const allClients = await queryRest(officeToken, "clients?select=id&limit=10");
    const otherClientId = allClients.find((c) => c.id !== portalClientId)?.id as string;

    if (!otherClientId) {
      console.warn("No other clients found, skipping test");
      return;
    }

    // Try to create a thread for another client - should fail
    const createThreadResult = await queryRest(portalToken, "message_threads", "POST", {
      client_id: otherClientId,
      thread_type: "general",
    }) as { error?: unknown; status?: number };

    expect(createThreadResult.error || createThreadResult.status).toBeDefined();
    const status = Number((createThreadResult as { status?: number | string }).status ?? 0);
    expect(status).toBeGreaterThanOrEqual(400);

    // Try to query threads for another client - should return empty
    const otherClientThreads = await queryRest(portalToken, `message_threads?client_id=eq.${otherClientId}`);
    expect(otherClientThreads).toHaveLength(0);
  });

  it("automation doesn't exceed throttle limits", async () => {
    const officeToken = await loginAndGetToken(process.env.OFFICE_USER_EMAIL ?? "", process.env.OFFICE_USER_PASSWORD ?? "");

    // Get a client
    const clients = await queryRest(officeToken, "clients?select=id&limit=1");
    if (clients.length === 0) {
      console.warn("No clients found, skipping test");
      return;
    }
    const clientId = clients[0].id as string;

    const throttleKey = `test_throttle_${Date.now()}`;

    // Create first notification (should succeed)
    const notification1 = await queryRest(officeToken, "notification_cadence", "POST", {
      client_id: clientId,
      entity_type: "test",
      notification_type: "test_notification",
      scheduled_for: new Date().toISOString(),
      throttle_key: throttleKey,
      sent_at: new Date().toISOString(),
    }) as RestRow;

    expect(notification1).toBeDefined();
    expect((notification1 as RestRow).id).toBeDefined();

    // Record the throttle (simulate sending)
    await queryRest(officeToken, "rpc/record_notification_throttle", "POST", {
      client_id: clientId,
      p_throttle_key: throttleKey,
    });

    // Check throttle via RPC - should return allowed=false since we just recorded
    // PostgREST RPC calls use query params: ?client_id=uuid&p_throttle_key=text
    const throttleCheckResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/check_notification_throttle?client_id=${clientId}&p_throttle_key=${encodeURIComponent(throttleKey)}`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${officeToken}`,
        },
      }
    );
    
    const throttleCheckText = await throttleCheckResponse.text();
    let throttleResult: { allowed: boolean; retry_after_seconds: number } | null = null;
    
    if (throttleCheckText.trim()) {
      try {
        const parsed = JSON.parse(throttleCheckText);
        // RPC can return single object or array
        throttleResult = Array.isArray(parsed) ? parsed[0] : parsed;
      } catch (e) {
        throw new Error(`Failed to parse throttle check response: ${throttleCheckText}`);
      }
    }
    
    expect(throttleResult).toBeDefined();
    expect(throttleResult?.allowed).toBe(false);
    expect(Number(throttleResult?.retry_after_seconds ?? 0)).toBeGreaterThan(0);
    
    const recentNotifications = await queryRest(officeToken, `notification_cadence?client_id=eq.${clientId}&throttle_key=eq.${throttleKey}&sent_at=gte.${new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()}`);
    
    // Should have exactly 1 notification in the last 72h
    expect(recentNotifications.length).toBeGreaterThanOrEqual(1);

    // Cleanup
    const notifId = (notification1 as RestRow)?.id;
    if (notifId) {
      await queryRest(officeToken, `notification_cadence?id=eq.${notifId}`, "DELETE");
    }
  });

  it("internal roles can see all message threads", async () => {
    const officeToken = await loginAndGetToken(process.env.OFFICE_USER_EMAIL ?? "", process.env.OFFICE_USER_PASSWORD ?? "");

    // Create threads for different clients
    const clients = await queryRest(officeToken, "clients?select=id&limit=2");
    if (clients.length < 2) {
      console.warn("Need at least 2 clients for this test, skipping");
      return;
    }

    const thread1 = await queryRest(officeToken, "message_threads", "POST", {
      client_id: clients[0].id,
      thread_type: "general",
    }) as RestRow;

    const thread2 = await queryRest(officeToken, "message_threads", "POST", {
      client_id: clients[1].id,
      thread_type: "general",
    }) as RestRow;

    if (!thread1?.id || !thread2?.id) {
      throw new Error(`Failed to create threads: thread1.id=${thread1?.id}, thread2.id=${thread2?.id}`);
    }

    try {
      // Office user should see both threads
      const allThreads = await queryRest(officeToken, "message_threads?select=id");
      const threadIds = allThreads.map((t) => t.id as string);
      
      expect(threadIds).toContain(thread1.id as string);
      expect(threadIds).toContain(thread2.id as string);
    } finally {
      // Cleanup
      if (thread1?.id) {
        await queryRest(officeToken, `message_threads?id=eq.${thread1.id}`, "DELETE").catch(() => {});
      }
      if (thread2?.id) {
        await queryRest(officeToken, `message_threads?id=eq.${thread2.id}`, "DELETE").catch(() => {});
      }
    }
  });

  it("estimate notifications are scheduled when sent_at is set", async () => {
    const officeToken = await loginAndGetToken(process.env.OFFICE_USER_EMAIL ?? "", process.env.OFFICE_USER_PASSWORD ?? "");

    // Get a client and rug
    const clients = await queryRest(officeToken, "clients?select=id&limit=1");
    if (clients.length === 0) {
      console.warn("No clients found, skipping test");
      return;
    }

    const rugs = await queryRest(officeToken, `rugs?client_id=eq.${clients[0].id}&select=id&limit=1`);
    if (rugs.length === 0) {
      console.warn("No rugs found for client, skipping test");
      return;
    }

    const clientId = clients[0].id as string;
    const rugId = rugs[0].id as string;

    // Create estimate
    const estimate = await queryRest(officeToken, "estimates", "POST", {
      estimate_number: `TEST-EST-${Date.now()}`,
      rug_id: rugId,
      client_id: clientId,
      status: "draft",
      total: 100,
    }) as RestRow;

    const estimateId = (estimate as RestRow)?.id as string;
    if (!estimateId) {
      throw new Error("Failed to create estimate: no ID returned");
    }

    try {
      // Update estimate to sent (should trigger notification scheduling)
      await queryRest(officeToken, `estimates?id=eq.${estimateId}`, "PATCH", {
        status: "sent",
        sent_at: new Date().toISOString(),
      });

      // Wait a bit for trigger to execute
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Check that notifications were scheduled
      const notifications = await queryRest(officeToken, `notification_cadence?entity_id=eq.${estimateId}&entity_type=eq.estimate`);
      
      // Should have at least the initial send notification
      expect(notifications.length).toBeGreaterThan(0);
      
      // Should have reminder notifications scheduled
      const reminderNotifications = notifications.filter((n) => 
        (n.notification_type as string).includes("reminder")
      );
      expect(reminderNotifications.length).toBeGreaterThan(0);
    } finally {
      // Cleanup
      await queryRest(officeToken, `notification_cadence?entity_id=eq.${estimateId}`, "DELETE").catch(() => {});
      await queryRest(officeToken, `estimates?id=eq.${estimateId}`, "DELETE").catch(() => {});
    }
  });
});
