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

type AppRole = "admin" | "office" | "checkin_staff";
type WorkflowMode = "create" | "edit";
type WorkflowSource = "pickup" | "dropoff";
type PricingTier = "standard" | "preferred" | "vip";

type WorkflowServiceInput = {
  service_id: string;
  service_name: string;
  quoted_price?: number | null;
  edges?: string[] | null;
};

type WorkflowPhotoInput = {
  storage_path: string;
  public_url?: string | null;
};

type WorkflowRequest = {
  mode: WorkflowMode;
  rugId?: string;
  sourceRugId?: string | null;
  actorUserId?: string | null;
  clientId?: string | null;
  clientName: string;
  rugNumber: string;
  rugType: string;
  length: number;
  width: number;
  conditionNotes: string;
  source: WorkflowSource;
  intakeDate?: string;
  services: WorkflowServiceInput[];
  photos?: WorkflowPhotoInput[];
};

type ServiceRuleRow = {
  id: string;
  category: string | null;
  unit: string | null;
  requires_estimate: boolean | null;
  base_price: number | null;
  preferred_price: number | null;
  vip_price: number | null;
};

type ClientRow = {
  id: string;
  name: string;
  email?: string | null;
  company_id?: string | null;
  pricing_tier?: PricingTier | null;
};

type ResolvedServicePricing = {
  unitPrice: number;
  lineTotal: number;
  category: string | null;
  unit: string | null;
  requiresEstimate: boolean | null;
};

const ALLOWED_ROLES: AppRole[] = ["admin", "office", "checkin_staff"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined) {
  return Boolean(value && UUID_PATTERN.test(value));
}

function isCleaningCategory(category: string | null | undefined) {
  return (category ?? "").trim().toLowerCase() === "cleaning";
}

function isStandardCleaningServiceName(serviceName: string | null | undefined) {
  const normalized = (serviceName ?? "").trim().toLowerCase();
  return normalized === "standard wash" || normalized === "standard cleaning" || normalized === "hand cleaning" || normalized === "hand cleaning (standard cleaning)";
}

function shouldAutoApproveService(service: WorkflowServiceInput, rule: ServiceRuleRow | undefined) {
  if (isCleaningCategory(rule?.category)) return true;
  return isStandardCleaningServiceName(service.service_name);
}

function generateJobCode() {
  return `JOB-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function generateEstimateNumber() {
  return `EST-${Date.now().toString(36).toUpperCase()}`;
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeNumber(value: unknown) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : 0;
}

function calcSelectedLinearFt(edges: string[] | null | undefined, length: number, width: number) {
  return (edges ?? []).reduce((sum, edge) => sum + ((edge === "top" || edge === "bottom") ? width : length), 0);
}

function normalizeServices(value: unknown): WorkflowServiceInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const service = row as Record<string, unknown>;
      return {
        service_id: normalizeText(service.service_id),
        service_name: normalizeText(service.service_name),
        quoted_price: service.quoted_price == null ? null : normalizeNumber(service.quoted_price),
        edges: Array.isArray(service.edges)
          ? service.edges.filter((edge): edge is string => typeof edge === "string")
          : [],
      };
    })
    .filter((row) => row.service_id && row.service_name);
}

function normalizePhotos(value: unknown): WorkflowPhotoInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const photo = row as Record<string, unknown>;
      return {
        storage_path: normalizeText(photo.storage_path),
        public_url: typeof photo.public_url === "string" ? photo.public_url : null,
      };
    })
    .filter((row) => row.storage_path);
}

function isMissingTableOrColumnError(message: string | undefined, target: string) {
  return new RegExp(`${target}|schema cache|relation .*${target}.* does not exist|column .*${target}`, "i").test(message ?? "");
}

function isUniqueViolation(message: string | undefined) {
  return /duplicate key value|unique constraint|23505/i.test(message ?? "");
}

function resolveTierUnitPrice(rule: ServiceRuleRow | undefined, pricingTier: PricingTier | null | undefined) {
  if (!rule) return 0;
  if (pricingTier === "vip") return normalizeNumber(rule.vip_price);
  if (pricingTier === "preferred") return normalizeNumber(rule.preferred_price);
  return normalizeNumber(rule.base_price);
}

function resolveServicePricing(params: {
  service: WorkflowServiceInput;
  rule: ServiceRuleRow | undefined;
  pricingTier: PricingTier | null | undefined;
  length: number;
  width: number;
}): ResolvedServicePricing {
  const { service, rule, pricingTier, length, width } = params;
  const unit = (rule?.unit ?? "").trim().toLowerCase();
  const unitPrice = resolveTierUnitPrice(rule, pricingTier);

  if (unit === "flat") {
    const quotedPrice = normalizeNumber(service.quoted_price);
    return {
      unitPrice: quotedPrice,
      lineTotal: quotedPrice,
      category: rule?.category ?? null,
      unit: rule?.unit ?? null,
      requiresEstimate: rule?.requires_estimate ?? null,
    };
  }

  if (unit === "per linear ft") {
    const selectedLinearFt = calcSelectedLinearFt(service.edges, length, width);
    return {
      unitPrice,
      lineTotal: unitPrice * selectedLinearFt,
      category: rule?.category ?? null,
      unit: rule?.unit ?? null,
      requiresEstimate: rule?.requires_estimate ?? null,
    };
  }

  if (unit === "per sqft") {
    const sqft = normalizeNumber(length) * normalizeNumber(width);
    return {
      unitPrice,
      lineTotal: unitPrice * sqft,
      category: rule?.category ?? null,
      unit: rule?.unit ?? null,
      requiresEstimate: rule?.requires_estimate ?? null,
    };
  }

  return {
    unitPrice,
    lineTotal: unitPrice,
    category: rule?.category ?? null,
    unit: rule?.unit ?? null,
    requiresEstimate: rule?.requires_estimate ?? null,
  };
}

async function claimIdempotencyKey(adminClient: ReturnType<typeof createClient>, params: {
  actorUserId: string;
  idempotencyKey: string;
  workflowMode: WorkflowMode;
}) {
  const { data, error } = await adminClient
    .from("checkin_idempotency_keys")
    .insert({
      actor_user_id: params.actorUserId,
      idempotency_key: params.idempotencyKey,
      workflow_mode: params.workflowMode,
      status: "processing",
    })
    .select("id, status, response_payload")
    .single();

  if (!error && data) {
    return { kind: "claimed" as const, rowId: data.id };
  }

  if (error && !isUniqueViolation(error.message)) throw error;

  const { data: existing, error: existingError } = await adminClient
    .from("checkin_idempotency_keys")
    .select("id, status, response_payload")
    .eq("actor_user_id", params.actorUserId)
    .eq("idempotency_key", params.idempotencyKey)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing) return { kind: "missing" as const };
  if (existing.status === "completed" && existing.response_payload) {
    return { kind: "replay" as const, response: existing.response_payload };
  }

  return { kind: "in_flight" as const };
}

async function completeIdempotencyKey(adminClient: ReturnType<typeof createClient>, params: {
  rowId: string;
  responsePayload: Record<string, unknown>;
  rugId: string | null;
  intakeJobId: string | null;
}) {
  const { error } = await adminClient
    .from("checkin_idempotency_keys")
    .update({
      status: "completed",
      response_payload: params.responsePayload,
      rug_id: params.rugId,
      intake_job_id: params.intakeJobId,
      completed_at: new Date().toISOString(),
    })
    .eq("id", params.rowId);

  if (error) throw error;
}

async function releaseIdempotencyKey(adminClient: ReturnType<typeof createClient>, rowId: string | null) {
  if (!rowId) return;
  const { error } = await adminClient.from("checkin_idempotency_keys").delete().eq("id", rowId);
  if (error) throw error;
}

function nextStageFromCheckedIn(currentStatus: string | null | undefined) {
  if ((currentStatus ?? "") !== "checked_in") return null;
  return "in_production";
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

async function resolveClient(adminClient: ReturnType<typeof createClient>, params: {
  clientId: string | null;
  clientName: string;
  callerCompanyId: string | null;
}) {
  if (params.clientId) {
    const query = adminClient
      .from("clients")
      .select("id, name, email, company_id, pricing_tier")
      .eq("id", params.clientId)
      .limit(1)
      .maybeSingle();

    const { data, error } = await query;
    if (error) throw error;
    if (!data) return null;
    if (params.callerCompanyId && data.company_id !== params.callerCompanyId) {
      throw new Error("Client does not belong to your company");
    }
    return data as ClientRow;
  }

  const trimmedName = params.clientName.trim();
  if (!trimmedName) return null;

  let query = adminClient
    .from("clients")
    .select("id, name, email, company_id, pricing_tier")
    .ilike("name", trimmedName)
    .limit(1);

  if (params.callerCompanyId) query = query.eq("company_id", params.callerCompanyId);

  const { data, error } = await query;
  if (error) throw error;
  return (data?.[0] as ClientRow | undefined) ?? null;
}

async function fetchServiceRules(adminClient: ReturnType<typeof createClient>, services: WorkflowServiceInput[]) {
  const serviceIds = [...new Set(services.map((service) => service.service_id).filter(Boolean))];
  if (serviceIds.length === 0) return new Map<string, ServiceRuleRow>();

  const { data, error } = await adminClient
    .from("services")
    .select("id, category, unit, requires_estimate, base_price, preferred_price, vip_price")
    .in("id", serviceIds);

  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row as ServiceRuleRow]));
}

async function insertRugServices(adminClient: ReturnType<typeof createClient>, params: {
  rugId: string;
  services: WorkflowServiceInput[];
  rules: Map<string, ServiceRuleRow>;
  pricingTier: PricingTier | null | undefined;
  length: number;
  width: number;
}) {
  if (params.services.length === 0) return { approvalStatusAvailable: true, error: null as string | null, totalPrice: 0 };

  const rows = params.services.map((service) => {
    const rule = params.rules.get(service.service_id);
    const pricing = resolveServicePricing({
      service,
      rule,
      pricingTier: params.pricingTier,
      length: params.length,
      width: params.width,
    });

    return {
      rug_id: params.rugId,
      service_id: service.service_id,
      service_name: service.service_name,
      unit_price: pricing.unitPrice,
      line_total: pricing.lineTotal,
      service_category: pricing.category,
      service_unit: pricing.unit,
      requires_estimate: pricing.requiresEstimate,
      edges: service.edges ?? [],
      approval_status: shouldAutoApproveService(service, rule) ? "approved" : "pending",
    };
  });

  const totalPrice = rows.reduce((sum, row) => sum + normalizeNumber(row.line_total), 0);

  const withStatus = await adminClient.from("rug_services").insert(rows);
  if (!withStatus.error) return { approvalStatusAvailable: true, error: null as string | null, totalPrice };
  if (!isMissingTableOrColumnError(withStatus.error.message, "approval_status")) {
    return { approvalStatusAvailable: true, error: withStatus.error.message, totalPrice };
  }

  const fallback = await adminClient.from("rug_services").insert(
    rows.map(({ approval_status: _approvalStatus, ...row }) => row),
  );
  return { approvalStatusAvailable: false, error: fallback.error?.message ?? null, totalPrice };
}

async function persistCheckinPhotos(adminClient: ReturnType<typeof createClient>, params: {
  rugId: string;
  clientId: string | null;
  jobId: string | null;
  actorUserId: string | null;
  photos: WorkflowPhotoInput[];
}) {
  if (params.photos.length === 0) return null;

  const { error } = await adminClient.from("checkin_photos").insert(
    params.photos.map((photo) => ({
      rug_id: params.rugId,
      client_id: params.clientId,
      job_id: params.jobId,
      storage_path: photo.storage_path,
      retention_policy: "permanent",
      expires_at: null,
      created_by: params.actorUserId,
    })),
  );

  if (!error) return null;
  if (isMissingTableOrColumnError(error.message, "checkin_photos")) return "Check-in photos metadata table is not provisioned in this environment.";
  throw error;
}

async function createDraftEstimate(adminClient: ReturnType<typeof createClient>, params: {
  rugId: string;
  clientId: string | null;
  rugNumber: string;
  actorUserId: string | null;
  services: WorkflowServiceInput[];
  rules: Map<string, ServiceRuleRow>;
  pricingTier: PricingTier | null | undefined;
  length: number;
  width: number;
}) {
  const eligible = params.services
    .map((service) => ({
      service,
      rule: params.rules.get(service.service_id),
    }))
    .filter(({ rule }) => Boolean(rule?.requires_estimate) && !isCleaningCategory(rule?.category))
    .map(({ service, rule }) => ({
      service,
      rule,
      pricing: resolveServicePricing({
        service,
        rule,
        pricingTier: params.pricingTier,
        length: params.length,
        width: params.width,
      }),
    }));

  if (eligible.length === 0) {
    return { estimateId: null, estimateNumber: null, warning: null as string | null };
  }

  const total = eligible.reduce((sum, entry) => sum + normalizeNumber(entry.pricing.lineTotal), 0);
  const estimateNumber = generateEstimateNumber();

  const { data: estimate, error: estimateError } = await adminClient
    .from("estimates")
    .insert({
      rug_id: params.rugId,
      client_id: params.clientId,
      estimate_number: estimateNumber,
      status: "needs_office_review",
      version: 1,
      total,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();

  if (estimateError || !estimate) {
    throw new Error(estimateError?.message ?? "Failed to create estimate draft");
  }

  const estimateItems = eligible.map(({ service, rule, pricing }) => ({
    estimate_id: estimate.id,
    rug_service_id: null,
    description: `${params.rugNumber} — ${service.service_name}`,
    quantity: 1,
    unit_price: normalizeNumber(pricing.unitPrice),
    total: normalizeNumber(pricing.lineTotal),
    service_category: rule?.category ?? "",
  }));

  const { error: itemError } = await adminClient.from("estimate_items").insert(estimateItems);
  if (itemError) {
    await adminClient.from("estimates").delete().eq("id", estimate.id);
    throw new Error(itemError.message);
  }

  return { estimateId: estimate.id, estimateNumber, warning: null as string | null };
}

async function appendContinuityNote(adminClient: ReturnType<typeof createClient>, params: {
  rugId: string;
  rugNumber: string;
  clientId: string | null;
  existingNotes: string;
}) {
  if (!params.clientId) return null;

  const { data: priorSameTagRugs, error } = await adminClient
    .from("rugs")
    .select("id, tag, status, checked_in_at, picked_up_at")
    .eq("client_id", params.clientId)
    .eq("tag", params.rugNumber)
    .neq("id", params.rugId)
    .order("checked_in_at", { ascending: false })
    .limit(3);

  if (error) throw error;

  const latestPriorSameTagRug = (priorSameTagRugs ?? [])[0] ?? null;
  if (!latestPriorSameTagRug) return null;

  const priorStateDate = latestPriorSameTagRug.picked_up_at ?? latestPriorSameTagRug.checked_in_at;
  const continuityNote = `Return continuity: prior same-tag rug ${latestPriorSameTagRug.tag} (${latestPriorSameTagRug.id}) last status ${latestPriorSameTagRug.status}${priorStateDate ? ` on ${new Date(priorStateDate).toLocaleString()}` : ""}.`;
  const mergedNotes = [params.existingNotes, continuityNote].filter(Boolean).join("\n\n");

  const { error: updateError } = await adminClient
    .from("rugs")
    .update({ notes: mergedNotes })
    .eq("id", params.rugId);

  if (updateError) throw updateError;
  return latestPriorSameTagRug;
}

async function recordCommunicationEvent(adminClient: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const { error } = await adminClient.from("communication_events").insert(payload);
  if (error) throw error;
}

async function tryCreateIntakeJob(adminClient: ReturnType<typeof createClient>, params: {
  clientId: string | null;
  source: WorkflowSource;
  intakeDate: string;
  actorUserId: string | null;
}) {
  const { data, error } = await adminClient
    .from("intake_jobs")
    .insert({
      job_code: generateJobCode(),
      client_id: params.clientId,
      source: params.source,
      intake_date: params.intakeDate,
      checkin_date: params.intakeDate,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();

  if (!error) return { jobId: data?.id ?? null, warning: null as string | null };
  if (isMissingTableOrColumnError(error.message, "intake_jobs")) {
    return { jobId: null, warning: "Intake job tracking is not yet provisioned in this environment." };
  }
  throw error;
}

async function insertRugWithFallback(adminClient: ReturnType<typeof createClient>, payload: {
  base: Record<string, unknown>;
  extended: Record<string, unknown>;
}) {
  const extendedInsert = await adminClient.from("rugs").insert(payload.extended).select("id").single();
  if (!extendedInsert.error) return { rugId: extendedInsert.data?.id ?? null, warning: null as string | null };

  if (!/column .*job_id|column .*intake_source|column .*intake_date/i.test(extendedInsert.error.message)) {
    throw extendedInsert.error;
  }

  const fallbackInsert = await adminClient.from("rugs").insert(payload.base).select("id").single();
  if (fallbackInsert.error) throw fallbackInsert.error;
  return { rugId: fallbackInsert.data?.id ?? null, warning: "Extended intake columns are not yet provisioned in this environment." };
}

async function rollbackCreate(adminClient: ReturnType<typeof createClient>, params: {
  rugId: string | null;
  intakeJobId: string | null;
}) {
  if (params.rugId) {
    await adminClient.from("rugs").delete().eq("id", params.rugId);
  }
  if (params.intakeJobId) {
    await adminClient.from("intake_jobs").delete().eq("id", params.intakeJobId);
  }
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
    const mode = body.mode === "edit" ? "edit" : body.mode === "create" ? "create" : null;
    if (!mode) return json({ error: "mode must be create or edit" }, 400);

    const request: WorkflowRequest = {
      mode,
      rugId: normalizeText(body.rugId) || undefined,
      sourceRugId: typeof body.sourceRugId === "string" ? body.sourceRugId : null,
      actorUserId: typeof body.actorUserId === "string" ? body.actorUserId : actor.user.id,
      clientId: typeof body.clientId === "string" ? body.clientId : null,
      clientName: normalizeText(body.clientName),
      rugNumber: normalizeText(body.rugNumber),
      rugType: normalizeText(body.rugType),
      length: normalizeNumber(body.length),
      width: normalizeNumber(body.width),
      conditionNotes: normalizeText(body.conditionNotes),
      source: body.source === "pickup" ? "pickup" : "dropoff",
      intakeDate: typeof body.intakeDate === "string" ? body.intakeDate : undefined,
      services: normalizeServices(body.services),
      photos: normalizePhotos(body.photos),
    };

    if (request.mode === "edit" && !request.rugId) return json({ error: "rugId is required for edit mode" }, 400);
    if (!request.rugNumber) return json({ error: "rugNumber is required" }, 400);
    if (!request.rugType) return json({ error: "rugType is required" }, 400);
    if (!request.clientName && !request.clientId) return json({ error: "clientName or clientId is required" }, 400);

    const warnings: string[] = [];
    const intakeDate = request.intakeDate && !Number.isNaN(new Date(request.intakeDate).getTime())
      ? new Date(request.intakeDate).toISOString()
      : new Date().toISOString();
    const idempotencyKey = req.headers.get("x-idempotency-key")?.trim() || null;

    const resolvedClient = await resolveClient(adminClient, {
      clientId: request.clientId ?? null,
      clientName: request.clientName,
      callerCompanyId: actor.companyId,
    });
    const clientId = resolvedClient?.id ?? request.clientId ?? null;
    const pricingTier = resolvedClient?.pricing_tier ?? "standard";

    if (request.clientId && !resolvedClient) {
      return json({ error: "Client not found" }, 404);
    }

    const serviceRules = await fetchServiceRules(adminClient, request.services);

    if (request.mode === "edit") {
      const { data: existingRug, error: rugError } = await adminClient
        .from("rugs")
        .select("id, client_id, notes, checked_in_at")
        .eq("id", request.rugId)
        .maybeSingle();

      if (rugError) return json({ error: rugError.message }, 500);
      if (!existingRug) return json({ error: "Rug not found" }, 404);

      if (existingRug.client_id) {
        const { data: existingClient, error: existingClientError } = await adminClient
          .from("clients")
          .select("id, company_id")
          .eq("id", existingRug.client_id)
          .maybeSingle();
        if (existingClientError) return json({ error: existingClientError.message }, 500);
        if (actor.companyId && existingClient && existingClient.company_id !== actor.companyId) {
          return json({ error: "Forbidden" }, 403);
        }
      }

      const { error: updateError } = await adminClient
        .from("rugs")
        .update({
          tag: request.rugNumber,
          description: request.rugType,
          size_length: request.length,
          size_width: request.width,
          services: request.services.map((service) => service.service_name),
          client_id: clientId,
          notes: request.conditionNotes,
          checked_in_at: intakeDate,
        })
        .eq("id", request.rugId);

      if (updateError) return json({ error: updateError.message }, 500);

      const { error: deleteServicesError } = await adminClient.from("rug_services").delete().eq("rug_id", request.rugId);
      if (deleteServicesError) return json({ error: deleteServicesError.message }, 500);

      const serviceInsert = await insertRugServices(adminClient, {
        rugId: request.rugId,
        services: request.services,
        rules: serviceRules,
        pricingTier,
        length: request.length,
        width: request.width,
      });
      if (serviceInsert.error) return json({ error: serviceInsert.error }, 500);
      if (!serviceInsert.approvalStatusAvailable) {
        warnings.push("Services were saved, but pending/approved/rejected is not enabled in this environment yet.");
      }

      const photoWarning = await persistCheckinPhotos(adminClient, {
        rugId: request.rugId,
        clientId,
        jobId: null,
        actorUserId: actor.user.id,
        photos: request.photos ?? [],
      });
      if (photoWarning) warnings.push(photoWarning);

      return json({
        status: warnings.length > 0 ? "warning" : "success",
        rugId: request.rugId,
        intakeJobId: null,
        estimateId: null,
        estimateNumber: null,
        warnings,
        resetForm: true,
        summary: {
          rugNumber: request.rugNumber,
          clientName: resolvedClient?.name ?? request.clientName,
          checkedInAt: intakeDate,
          totalPrice: serviceInsert.totalPrice,
        },
      });
    }

    let claimedIdempotencyRowId: string | null = null;
    let intakeJobIdForRollback: string | null = null;
    let rugIdForRollback: string | null = null;

    try {
      if (request.mode === "create" && idempotencyKey) {
        const idempotencyClaim = await claimIdempotencyKey(adminClient, {
          actorUserId: actor.user.id,
          idempotencyKey,
          workflowMode: request.mode,
        });

        if (idempotencyClaim.kind === "replay") {
          return json(idempotencyClaim.response);
        }
        if (idempotencyClaim.kind === "in_flight") {
          return json({ error: "A matching check-in is already processing. Retry in a moment." }, 409);
        }
        if (idempotencyClaim.kind === "claimed") {
          claimedIdempotencyRowId = idempotencyClaim.rowId;
        }
      }

      const intakeJob = await tryCreateIntakeJob(adminClient, {
        clientId,
        source: request.source,
        intakeDate,
        actorUserId: actor.user.id,
      });
      intakeJobIdForRollback = intakeJob.jobId;
      if (intakeJob.warning) warnings.push(intakeJob.warning);

      const baseRugPayload = {
        tag: request.rugNumber,
        description: request.rugType,
        size_length: request.length,
        size_width: request.width,
        services: request.services.map((service) => service.service_name),
        client_id: clientId,
        company_id: actor.companyId,
        checked_in_by: actor.user.id,
        checked_in_at: intakeDate,
        notes: request.conditionNotes,
      };

      const rugInsert = await insertRugWithFallback(adminClient, {
        base: baseRugPayload,
        extended: {
          ...baseRugPayload,
          job_id: intakeJob.jobId,
          intake_source: request.source,
          intake_date: intakeDate,
        },
      });
      if (rugInsert.warning) warnings.push(rugInsert.warning);
      const rugId = rugInsert.rugId;
      rugIdForRollback = rugId;
      if (!rugId) return json({ error: "Check-in failed" }, 500);

      const serviceInsert = await insertRugServices(adminClient, {
        rugId,
        services: request.services,
        rules: serviceRules,
        pricingTier,
        length: request.length,
        width: request.width,
      });
      if (serviceInsert.error) throw new Error(serviceInsert.error);
      if (!serviceInsert.approvalStatusAvailable) {
        warnings.push("Services were saved, but pending/approved/rejected is not enabled in this environment yet.");
      }

      const photoWarning = await persistCheckinPhotos(adminClient, {
        rugId,
        clientId,
        jobId: intakeJob.jobId,
        actorUserId: actor.user.id,
        photos: request.photos ?? [],
      });
      if (photoWarning) warnings.push(photoWarning);

      const nextStage = nextStageFromCheckedIn("checked_in");
      if (nextStage) {
        const { error: advanceError } = await adminClient.from("rugs").update({ status: nextStage }).eq("id", rugId);
        if (advanceError) throw advanceError;
      }

      const estimate = await createDraftEstimate(adminClient, {
        rugId,
        clientId,
        rugNumber: request.rugNumber,
        actorUserId: actor.user.id,
        services: request.services,
        rules: serviceRules,
        pricingTier,
        length: request.length,
        width: request.width,
      });

      const postSubmitTasks: Promise<unknown>[] = [];

      if ((request.photos ?? []).length > 0) {
        const firstPhotoUrl = (request.photos ?? []).find((photo) => photo.public_url)?.public_url ?? null;
        if (firstPhotoUrl) {
          postSubmitTasks.push(
            adminClient
              .from("rugs")
              .update({ photo_url: firstPhotoUrl })
              .eq("id", rugId)
              .then(({ error }) => {
                if (error) throw error;
              }),
          );
        }
      }

      if (request.sourceRugId && isUuid(request.sourceRugId)) {
        postSubmitTasks.push((async () => {
          const { data: pickupItem, error: pickupItemError } = await adminClient
            .from("pickup_request_items")
            .select("id, pickup_request_id")
            .eq("id", request.sourceRugId)
            .maybeSingle();
          if (pickupItemError) throw pickupItemError;
          if (!pickupItem) return;

          const { data: pickupRequest, error: pickupRequestError } = await adminClient
            .from("pickup_requests")
            .select("id, client_id")
            .eq("id", pickupItem.pickup_request_id)
            .maybeSingle();
          if (pickupRequestError) throw pickupRequestError;
          if (actor.companyId && pickupRequest?.client_id) {
            const { data: pickupClient, error: pickupClientError } = await adminClient
              .from("clients")
              .select("id, company_id")
              .eq("id", pickupRequest.client_id)
              .maybeSingle();
            if (pickupClientError) throw pickupClientError;
            if (pickupClient && pickupClient.company_id !== actor.companyId) throw new Error("Forbidden pickup item link");
          }

          const { error: linkError } = await adminClient
            .from("pickup_request_items")
            .update({ checked_in_rug_id: rugId })
            .eq("id", request.sourceRugId);
          if (linkError) throw linkError;
        })());
      }

      postSubmitTasks.push((async () => {
        const priorSameTagRug = await appendContinuityNote(adminClient, {
          rugId,
          rugNumber: request.rugNumber,
          clientId,
          existingNotes: request.conditionNotes,
        });
        if (!priorSameTagRug || !clientId) return;
        await recordCommunicationEvent(adminClient, {
          client_id: clientId,
          rug_id: rugId,
          channel: "in_app_chat",
          direction: "outbound",
          event_type: "rug_continuity_linked",
          subject: `${request.rugNumber} linked to prior same-tag history`,
          body: `New intake ${rugId} matches prior rug ${priorSameTagRug.id} for the same client and tag. Prior status: ${priorSameTagRug.status}.`,
          created_by: actor.user.id,
        });
      })());

      if (estimate.estimateId) {
        postSubmitTasks.push(recordCommunicationEvent(adminClient, {
          client_id: clientId,
          rug_id: rugId,
          estimate_id: estimate.estimateId,
          channel: "in_app_chat",
          direction: "outbound",
          event_type: "estimate_auto_drafted_from_checkin",
          subject: `${estimate.estimateNumber} auto-drafted`,
          body: `Estimate ${estimate.estimateNumber} was auto-created from check-in service selections.`,
          created_by: actor.user.id,
        }));
      }

      const sideEffectResults = await Promise.allSettled(postSubmitTasks);
      for (const result of sideEffectResults) {
        if (result.status === "rejected") warnings.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }

      const responsePayload = {
        status: warnings.length > 0 ? "warning" : "success",
        rugId,
        intakeJobId: intakeJob.jobId,
        estimateId: estimate.estimateId,
        estimateNumber: estimate.estimateNumber,
        warnings,
        resetForm: true,
        summary: {
          rugNumber: request.rugNumber,
          clientName: resolvedClient?.name ?? request.clientName,
          checkedInAt: intakeDate,
          totalPrice: serviceInsert.totalPrice,
        },
      };

      if (claimedIdempotencyRowId) {
        await completeIdempotencyKey(adminClient, {
          rowId: claimedIdempotencyRowId,
          responsePayload,
          rugId,
          intakeJobId: intakeJob.jobId,
        });
      }

      return json(responsePayload);
    } catch (error) {
      await rollbackCreate(adminClient, { rugId: rugIdForRollback, intakeJobId: intakeJobIdForRollback });
      await releaseIdempotencyKey(adminClient, claimedIdempotencyRowId);
      return json({ error: error instanceof Error ? error.message : "Check-in workflow failed" }, 500);
    }
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
});
