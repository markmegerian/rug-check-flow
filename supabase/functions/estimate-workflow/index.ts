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
type WorkflowMode = "create" | "revise";

type RugServiceSnapshot = {
  id: string;
  service_id: string | null;
  service_name: string;
  service_category: string | null;
  requires_estimate: boolean | null;
  unit_price: number | string | null;
  line_total: number | string | null;
};

type EstimateItemSnapshot = {
  description: string;
  quantity: number | string;
  unit_price: number | string;
  total: number | string;
  service_category: string;
  rug_service_id: string | null;
};

const ALLOWED_ROLES: AppRole[] = ["admin", "office"];

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeNumber(value: unknown) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function generateEstimateNumber() {
  return `EST-${Date.now().toString(36).toUpperCase()}`;
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

function resolveSnapshotCategory(service: RugServiceSnapshot) {
  return service.service_category ?? "";
}

async function createEstimateFromRug(adminClient: ReturnType<typeof createClient>, params: {
  rugId: string;
  actorUserId: string;
  callerCompanyId: string | null;
}) {
  const { data: rug, error: rugError } = await adminClient
    .from("rugs")
    .select("id, tag, client_id, company_id, clients(name, email, company_id)")
    .eq("id", params.rugId)
    .maybeSingle();

  if (rugError) throw rugError;
  if (!rug) return json({ error: "Rug not found" }, 404);

  const rugCompanyId = rug.company_id ?? rug.clients?.company_id ?? null;
  if (params.callerCompanyId && rugCompanyId && rugCompanyId !== params.callerCompanyId) {
    return json({ error: "Forbidden" }, 403);
  }

  const { data: serviceRows, error: serviceError } = await adminClient
    .from("rug_services")
    .select("id, service_id, service_name, service_category, requires_estimate, unit_price, line_total")
    .eq("rug_id", params.rugId);

  if (serviceError) throw serviceError;

  const services = (serviceRows ?? []) as RugServiceSnapshot[];
  if (services.length === 0) {
    return json({ error: "This rug has no captured service pricing yet." }, 400);
  }

  const total = services.reduce((sum, service) => sum + normalizeNumber(service.line_total), 0);
  const estimateNumber = generateEstimateNumber();

  const { data: insertedEstimate, error: estimateError } = await adminClient
    .from("estimates")
    .insert({
      rug_id: params.rugId,
      client_id: rug.client_id,
      estimate_number: estimateNumber,
      status: "draft",
      version: 1,
      total,
      created_by: params.actorUserId,
    })
    .select("id, estimate_number, total, version")
    .single();

  if (estimateError || !insertedEstimate) {
    throw new Error(estimateError?.message ?? "Estimate creation failed");
  }

  const items = services.map((service) => ({
    estimate_id: insertedEstimate.id,
    rug_service_id: service.id,
    description: `${rug.tag} — ${service.service_name}`,
    quantity: 1,
    unit_price: normalizeNumber(service.unit_price),
    total: normalizeNumber(service.line_total),
    service_category: resolveSnapshotCategory(service),
  }));

  const { error: itemError } = await adminClient.from("estimate_items").insert(items);
  if (itemError) {
    await adminClient.from("estimates").delete().eq("id", insertedEstimate.id);
    throw new Error(itemError.message);
  }

  await recordCommunicationEvent(adminClient, {
    client_id: rug.client_id,
    rug_id: params.rugId,
    estimate_id: insertedEstimate.id,
    channel: "email",
    direction: "outbound",
    event_type: "estimate_created",
    subject: `${estimateNumber} created`,
    body: `Estimate ${estimateNumber} created from service snapshot.`,
    sent_to: rug.clients?.email ?? null,
    created_by: params.actorUserId,
  });

  return json({
    status: "success",
    mode: "create",
    estimateId: insertedEstimate.id,
    estimateNumber,
    version: 1,
    total,
    rugId: params.rugId,
    clientName: rug.clients?.name ?? null,
    rugTag: rug.tag,
  });
}

async function reviseEstimate(adminClient: ReturnType<typeof createClient>, params: {
  estimateId: string;
  actorUserId: string;
  callerCompanyId: string | null;
}) {
  const { data: estimate, error: estimateError } = await adminClient
    .from("estimates")
    .select("id, rug_id, client_id, estimate_number, status, version, rugs(tag, company_id), clients(name, email, company_id)")
    .eq("id", params.estimateId)
    .maybeSingle();

  if (estimateError) throw estimateError;
  if (!estimate) return json({ error: "Estimate not found" }, 404);
  if (estimate.status !== "rejected") return json({ error: "Only rejected estimates can be revised." }, 400);

  const estimateCompanyId = estimate.rugs?.company_id ?? estimate.clients?.company_id ?? null;
  if (params.callerCompanyId && estimateCompanyId && estimateCompanyId !== params.callerCompanyId) {
    return json({ error: "Forbidden" }, 403);
  }

  const { data: originalItems, error: itemReadError } = await adminClient
    .from("estimate_items")
    .select("description, quantity, unit_price, total, service_category, rug_service_id")
    .eq("estimate_id", params.estimateId);

  if (itemReadError) throw itemReadError;
  if (!originalItems || originalItems.length === 0) {
    return json({ error: "Original estimate has no line items." }, 400);
  }

  const itemsToCopy = originalItems as EstimateItemSnapshot[];
  const newVersion = (estimate.version ?? 1) + 1;
  const newNumber = `${estimate.estimate_number}-R${newVersion}`;
  const total = itemsToCopy.reduce((sum, item) => sum + normalizeNumber(item.total), 0);

  const { data: newEstimate, error: newEstimateError } = await adminClient
    .from("estimates")
    .insert({
      rug_id: estimate.rug_id,
      client_id: estimate.client_id,
      estimate_number: newNumber,
      status: "draft",
      version: newVersion,
      total,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();

  if (newEstimateError || !newEstimate) {
    throw new Error(newEstimateError?.message ?? "Revision failed");
  }

  const copiedItems = itemsToCopy.map((item) => ({
    estimate_id: newEstimate.id,
    rug_service_id: item.rug_service_id,
    description: item.description,
    quantity: normalizeNumber(item.quantity),
    unit_price: normalizeNumber(item.unit_price),
    total: normalizeNumber(item.total),
    service_category: item.service_category,
  }));

  const { error: copyError } = await adminClient.from("estimate_items").insert(copiedItems);
  if (copyError) {
    await adminClient.from("estimates").delete().eq("id", newEstimate.id);
    throw new Error(copyError.message);
  }

  await recordCommunicationEvent(adminClient, {
    client_id: estimate.client_id,
    rug_id: estimate.rug_id,
    estimate_id: newEstimate.id,
    channel: "email",
    direction: "outbound",
    event_type: "estimate_revised",
    subject: `${newNumber} revised from ${estimate.estimate_number}`,
    body: `Revised estimate created from rejected ${estimate.estimate_number}.`,
    sent_to: estimate.clients?.email ?? null,
    created_by: params.actorUserId,
  });

  return json({
    status: "success",
    mode: "revise",
    estimateId: newEstimate.id,
    estimateNumber: newNumber,
    version: newVersion,
    total,
    rugId: estimate.rug_id,
    clientName: estimate.clients?.name ?? null,
    rugTag: estimate.rugs?.tag ?? null,
  });
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
    const mode: WorkflowMode | null = body.mode === "revise" ? "revise" : body.mode === "create" ? "create" : null;
    if (!mode) return json({ error: "mode must be create or revise" }, 400);

    if (mode === "create") {
      const rugId = normalizeText(body.rugId);
      if (!rugId) return json({ error: "rugId is required" }, 400);
      return await createEstimateFromRug(adminClient, {
        rugId,
        actorUserId: actor.user.id,
        callerCompanyId: actor.companyId,
      });
    }

    const estimateId = normalizeText(body.estimateId);
    if (!estimateId) return json({ error: "estimateId is required" }, 400);
    return await reviseEstimate(adminClient, {
      estimateId,
      actorUserId: actor.user.id,
      callerCompanyId: actor.companyId,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
