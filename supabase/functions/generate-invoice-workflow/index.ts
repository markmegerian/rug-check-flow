import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-idempotency-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type AppRole = "admin" | "office";

type RugRow = {
  id: string;
  tag: string;
  client_id: string | null;
  status: string | null;
  company_id: string | null;
};

type RugServiceRow = {
  rug_id: string;
  service_id: string | null;
  service_name: string;
  unit_price: number | string | null;
  line_total: number | string | null;
};

const ALLOWED_ROLES: AppRole[] = ["admin", "office"];
const CLEANING_SERVICE_MINIMUM = 35;

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeNumber(value: unknown) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function generateInvoiceNumber() {
  return `INV-${Date.now().toString(36).toUpperCase()}`;
}

function isCleaningCategory(category: string | null | undefined): boolean {
  return (category ?? "").trim().toLowerCase() === "cleaning";
}

function applyCleaningServiceMinimum(amount: number, category: string | null | undefined): number {
  const normalized = Number(amount) || 0;
  if (!isCleaningCategory(category)) return normalized;
  return Math.max(normalized, CLEANING_SERVICE_MINIMUM);
}

async function resolveCallerCompanyId(adminClient: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await adminClient.rpc("get_user_company_id", { _user_id: userId });
  if (error) throw error;
  return data ?? null;
}

async function resolveActor(adminClient: ReturnType<typeof createClient>, anonClient: ReturnType<typeof createClient>, authHeader: string | null) {
  if (!authHeader) return { error: json({ error: "Unauthorized" }, 401), user: null, companyId: null };

  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userError } = await anonClient.auth.getUser(token);
  if (userError || !userData.user) return { error: json({ error: "Unauthorized" }, 401), user: null, companyId: null };

  const user = userData.user;
  const { data: roleRows, error: roleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ALLOWED_ROLES)
    .limit(1);

  if (roleError) return { error: json({ error: roleError.message }, 500), user: null, companyId: null };
  if (!roleRows || roleRows.length === 0) return { error: json({ error: "Forbidden" }, 403), user: null, companyId: null };

  try {
    const companyId = await resolveCallerCompanyId(adminClient, user.id);
    return { error: null, user, companyId };
  } catch (error) {
    return { error: json({ error: error instanceof Error ? error.message : "Failed to resolve company" }, 500), user: null, companyId: null };
  }
}

async function recordCommunicationEvent(adminClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { error } = await adminClient.from("communication_events").insert(payload);
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "Function environment is not fully configured." }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, anonKey);

    const actor = await resolveActor(adminClient, anonClient, req.headers.get("Authorization"));
    if (actor.error || !actor.user) return actor.error;

    const rawBody = await req.json().catch(() => null);
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const clientId = normalizeText(body.clientId);
    const rugIds = Array.isArray(body.rugIds)
      ? body.rugIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    if (!clientId) return json({ error: "clientId is required" }, 400);
    if (rugIds.length === 0) return json({ error: "At least one rug is required" }, 400);

    const { data: client, error: clientError } = await adminClient
      .from("clients")
      .select("id, name, company_id")
      .eq("id", clientId)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) return json({ error: "Client not found" }, 404);
    if (actor.companyId && client.company_id && client.company_id !== actor.companyId) {
      return json({ error: "Forbidden" }, 403);
    }

    const { data: rugRows, error: rugError } = await adminClient
      .from("rugs")
      .select("id, tag, client_id, status, company_id")
      .in("id", rugIds);

    if (rugError) throw rugError;

    const rugs = (rugRows ?? []) as RugRow[];
    if (rugs.length !== rugIds.length) return json({ error: "One or more rugs were not found" }, 404);

    for (const rug of rugs) {
      if (rug.client_id !== clientId) return json({ error: "All rugs must belong to the selected client" }, 400);
      if (rug.status !== "ready") return json({ error: `Rug ${rug.tag} is not ready for invoicing` }, 400);
      if (actor.companyId && rug.company_id && rug.company_id !== actor.companyId) {
        return json({ error: "Forbidden" }, 403);
      }
    }

    const { data: existingItems, error: existingItemsError } = await adminClient
      .from("invoice_items")
      .select("rug_id")
      .in("rug_id", rugIds);
    if (existingItemsError) throw existingItemsError;
    if ((existingItems ?? []).length > 0) {
      return json({ error: "One or more selected rugs already have invoice items" }, 400);
    }

    const { data: rugServiceRows, error: rugServicesError } = await adminClient
      .from("rug_services")
      .select("rug_id, service_id, service_name, unit_price, line_total")
      .in("rug_id", rugIds);

    if (rugServicesError) throw rugServicesError;
    const rugServices = (rugServiceRows ?? []) as RugServiceRow[];
    if (rugServices.length === 0) return json({ error: "Selected rugs have no services to invoice." }, 400);

    const serviceIds = [...new Set(rugServices.map((service) => service.service_id).filter(Boolean))] as string[];
    let categoryByServiceId: Record<string, string> = {};
    if (serviceIds.length > 0) {
      const { data: serviceRows, error: serviceError } = await adminClient
        .from("services")
        .select("id, category")
        .in("id", serviceIds);
      if (serviceError) throw serviceError;
      categoryByServiceId = Object.fromEntries((serviceRows ?? []).map((row) => [row.id, row.category ?? ""]));
    }

    const rugTagMap = Object.fromEntries(rugs.map((rug) => [rug.id, rug.tag]));
    const normalizedRugServices = rugServices.map((service) => {
      const adjustedTotal = applyCleaningServiceMinimum(
        normalizeNumber(service.line_total),
        service.service_id ? (categoryByServiceId[service.service_id] ?? null) : null,
      );
      return {
        ...service,
        unit_price: adjustedTotal,
        line_total: adjustedTotal,
      };
    });

    const total = normalizedRugServices.reduce((sum, service) => sum + normalizeNumber(service.line_total), 0);
    const invoiceNumber = generateInvoiceNumber();

    const { data: invoice, error: invoiceError } = await adminClient
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        client_id: clientId,
        status: "draft",
        total,
        pdf_storage_path: `clients/${clientId}/${invoiceNumber}.pdf`,
      })
      .select("id")
      .single();

    if (invoiceError || !invoice) {
      throw new Error(invoiceError?.message ?? "Failed to create invoice");
    }

    const lineItems = normalizedRugServices.map((service) => ({
      invoice_id: invoice.id,
      rug_id: service.rug_id,
      description: `${rugTagMap[service.rug_id] ?? "Rug"} — ${service.service_name}`,
      quantity: 1,
      unit_price: normalizeNumber(service.unit_price),
      total: normalizeNumber(service.line_total),
    }));

    const { error: lineItemsError } = await adminClient.from("invoice_items").insert(lineItems);
    if (lineItemsError) {
      await adminClient.from("invoices").delete().eq("id", invoice.id);
      throw new Error(lineItemsError.message);
    }

    await recordCommunicationEvent(adminClient, {
      client_id: clientId,
      invoice_id: invoice.id,
      channel: "in_app_chat",
      direction: "outbound",
      event_type: "walkin_invoice_created",
      subject: `${invoiceNumber} created for handoff`,
      body: `Invoice ${invoiceNumber} was created from the walk-in / on-site pickup handoff flow for ${rugIds.length} ready rug(s).`,
      created_by: actor.user.id,
    });

    return json({
      status: "success",
      invoiceId: invoice.id,
      invoiceNumber,
      total,
      clientId,
      clientName: client.name,
      rugIds,
      rugCount: rugIds.length,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
