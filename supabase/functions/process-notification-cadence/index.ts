import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { addDays } from "https://esm.sh/date-fns@3.6.0";
import { buildReminderDeliveryCopy } from "../_shared/reminder-delivery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type CadenceRow = {
  id: string;
  client_id: string;
  entity_type: string;
  entity_id: string | null;
  notification_type: string;
  scheduled_for: string;
  sent_at: string | null;
  throttle_key: string;
};

type ThrottleRow = {
  id: string;
  client_id: string;
  throttle_key: string;
  last_sent_at: string;
};

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

function isValidEmail(email: string | null | undefined) {
  const normalized = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

async function readResponseBody(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function describeProviderFailure(provider: string, status: number, payload: unknown) {
  if (payload && typeof payload === "object") {
    const message = (payload as { message?: unknown; error?: unknown }).message ?? (payload as { error?: unknown }).error;
    if (typeof message === "string" && message.trim()) {
      return `${provider} failed (${status}): ${message.trim()}`;
    }
  }
  if (typeof payload === "string" && payload.trim()) {
    return `${provider} failed (${status}): ${payload.trim()}`;
  }
  return `${provider} failed (${status})`;
}

function isCollectionsNotification(type: string) {
  return type.startsWith("invoice_");
}

function shouldThrottle(lastSentAt: string | null | undefined, scheduledFor: string) {
  if (!lastSentAt) return false;
  return new Date(scheduledFor).getTime() - new Date(lastSentAt).getTime() < 72 * 60 * 60 * 1000;
}

function buildEstimateReminderRows(params: { clientId: string; estimateId: string; sentAt: string }) {
  const sentAt = new Date(params.sentAt);
  const throttleKey = `estimate:${params.clientId}`;
  return [
    { client_id: params.clientId, entity_type: "estimate", entity_id: params.estimateId, notification_type: "estimate_reminder_24h", scheduled_for: new Date(sentAt.getTime() + 24 * 60 * 60 * 1000).toISOString(), throttle_key: throttleKey },
    { client_id: params.clientId, entity_type: "estimate", entity_id: params.estimateId, notification_type: "estimate_reminder_72h", scheduled_for: new Date(sentAt.getTime() + 72 * 60 * 60 * 1000).toISOString(), throttle_key: throttleKey },
    { client_id: params.clientId, entity_type: "estimate", entity_id: params.estimateId, notification_type: "estimate_reminder_7d", scheduled_for: addDays(sentAt, 7).toISOString(), throttle_key: throttleKey },
  ];
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function loadEntityLabel(adminClient: ReturnType<typeof createClient>, row: CadenceRow) {
  if (!row.entity_id) return null;
  if (row.entity_type === "estimate") {
    const { data } = await adminClient.from("estimates").select("estimate_number").eq("id", row.entity_id).maybeSingle();
    return data?.estimate_number ?? row.entity_id;
  }
  if (row.entity_type === "invoice") {
    const { data } = await adminClient.from("invoices").select("invoice_number").eq("id", row.entity_id).maybeSingle();
    return data?.invoice_number ?? row.entity_id;
  }
  return row.entity_id;
}

async function processEstimateBatchSend(adminClient: ReturnType<typeof createClient>, params: { estimateId: string; actorUserId: string | null; emailDeliveryEnabled: boolean }) {
  const nowIso = new Date().toISOString();
  const { data: estimate, error: estErr } = await adminClient
    .from("estimates")
    .select("id, estimate_number, status, total, client_id, rug_id, clients(name,email,company_id), rugs(tag)")
    .eq("id", params.estimateId)
    .single();

  if (estErr || !estimate) return { status: "skipped", reason: "Estimate not found" };
  if (!estimate.client_id) return { status: "failed", reason: "Estimate missing client link" };
  if (estimate.status !== "ready_to_send") return { status: "skipped", reason: `Estimate already ${estimate.status}` };

  const { data: batchId, error: ensureBatchError } = await adminClient.rpc("ensure_estimate_send_batch", {
    p_client_id: estimate.client_id,
    p_company_id: estimate.clients?.company_id ?? null,
    p_scheduled_for: nowIso,
    p_recipient_email: estimate.clients?.email ?? null,
    p_subject: estimate.clients?.name ? `Estimate batch for ${estimate.clients.name}` : "Estimate batch",
  });

  if (ensureBatchError || !batchId) {
    return { status: "failed", reason: ensureBatchError?.message ?? "Estimate batch creation failed" };
  }

  const { error: batchItemError } = await adminClient
    .from("estimate_send_batch_items")
    .upsert({
      batch_id: batchId,
      estimate_id: estimate.id,
    }, { onConflict: "batch_id,estimate_id" });

  if (batchItemError) {
    return { status: "failed", reason: batchItemError.message };
  }

  const { data: batchItems, error: batchItemsError } = await adminClient
    .from("estimate_send_batch_items")
    .select("estimate_id, estimates(id, estimate_number, status, total, client_id, rug_id, clients(name,email), rugs(tag))")
    .eq("batch_id", batchId);

  if (batchItemsError || !batchItems) return { status: "failed", reason: batchItemsError?.message ?? "Estimate batch items not found" };

  const readyEstimates = batchItems
    .map((row) => row.estimates)
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter((row) => row.status === "ready_to_send");

  if (readyEstimates.length === 0) return { status: "skipped", reason: "No ready estimates in batch" };

  const clientEmail = normalizeEmail(estimate.clients?.email ?? null);
  if (!clientEmail) {
    await adminClient.from("communication_events").insert({
      client_id: estimate.client_id,
      estimate_batch_id: batchId,
      estimate_id: estimate.id,
      rug_id: estimate.rug_id,
      channel: "email",
      direction: "outbound",
      event_type: "estimate_send_failed",
      subject: `Estimate batch send blocked`,
      body: "Estimate batch send was blocked because the client email is missing.",
      created_by: params.actorUserId,
    });
    await adminClient.from("estimate_send_batches").update({ status: "failed" }).eq("id", batchId);
    return { status: "failed", reason: "Client email is missing" };
  }

  if (!isValidEmail(clientEmail)) {
    await adminClient.from("communication_events").insert({
      client_id: estimate.client_id,
      estimate_batch_id: batchId,
      estimate_id: estimate.id,
      rug_id: estimate.rug_id,
      channel: "email",
      direction: "outbound",
      event_type: "estimate_send_failed",
      subject: `Estimate batch send blocked`,
      body: `Estimate batch send was blocked because the client email is invalid: ${clientEmail}`,
      sent_to: clientEmail,
      created_by: params.actorUserId,
    });
    await adminClient.from("estimate_send_batches").update({ status: "failed" }).eq("id", batchId);
    return { status: "failed", reason: "Client email is invalid" };
  }

  let providerStatus: "sent" | "failed" | "not_configured" | "disabled" = "not_configured";
  let providerMessage = "Estimate batch marked sent without email provider";
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("ESTIMATE_EMAIL_FROM") ?? "RugBoost <no-reply@rugboost.local>";
  const portalUrl = Deno.env.get("PORTAL_APP_URL") ?? "https://mr.rugboost.com/portal";
  const subject = readyEstimates.length === 1
    ? `Estimate ${readyEstimates[0].estimate_number} from RugBoost`
    : `Your RugBoost estimates are ready`;
  const body = [
    `Hello ${estimate.clients?.name ?? "client"},`,
    "",
    readyEstimates.length === 1 ? "Your estimate is ready." : `Your ${readyEstimates.length} estimates are ready.`,
    "",
    ...readyEstimates.flatMap((item) => [
      `${item.estimate_number} · Rug ${item.rugs?.tag ?? "N/A"} · $${Number(item.total ?? 0).toFixed(2)}`,
    ]),
    "",
    `Please sign in to the portal to approve or reject these estimate items: ${portalUrl}`,
  ].join("\n");

  if (!params.emailDeliveryEnabled) {
    return { status: "disabled", reason: "Client email delivery is disabled until onboarding is complete" };
  }

  if (resendApiKey) {
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [clientEmail],
        subject,
        text: body,
      }),
    });
    const resendPayload = await readResponseBody(resendResp);
    providerStatus = resendResp.ok ? "sent" : "failed";
    providerMessage = resendResp.ok ? "Estimate batch email delivered" : describeProviderFailure("Resend", resendResp.status, resendPayload);
  }

  if (providerStatus === "failed") {
    await adminClient.from("communication_events").insert({
      client_id: estimate.client_id,
      estimate_batch_id: batchId,
      estimate_id: estimate.id,
      rug_id: estimate.rug_id,
      channel: "email",
      direction: "outbound",
      event_type: "estimate_send_failed",
      subject,
      body,
      sent_to: clientEmail,
      created_by: params.actorUserId,
    });
    await adminClient.from("estimate_send_batches").update({ status: "failed", recipient_email: clientEmail, subject, body }).eq("id", batchId);
    return { status: "failed", reason: providerMessage };
  }

  const readyEstimateIds = readyEstimates.map((item) => item.id);
  await adminClient.from("estimates").update({ status: "sent", sent_at: nowIso }).in("id", readyEstimateIds);
  await adminClient.from("estimate_send_batches").update({ status: "sent", sent_at: nowIso, recipient_email: clientEmail, subject, body }).eq("id", batchId);

  await adminClient.from("notification_cadence").upsert(
    readyEstimates.flatMap((item) => buildEstimateReminderRows({ clientId: estimate.client_id, estimateId: item.id, sentAt: nowIso })),
    { onConflict: "client_id,entity_type,entity_id,notification_type" },
  );

  await adminClient.from("communication_events").insert(
    readyEstimates.map((item) => ({
      client_id: estimate.client_id,
      estimate_batch_id: batchId,
      estimate_id: item.id,
      rug_id: item.rug_id,
      channel: "email",
      direction: "outbound",
      event_type: "estimate_sent",
      subject,
      body,
      sent_to: clientEmail,
      created_by: params.actorUserId,
    })),
  );

  return { status: providerStatus, reason: providerMessage };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const cronSecret = req.headers.get("x-cron-secret");
    const configuredCronSecret = Deno.env.get("PROCESS_NOTIFICATION_CADENCE_SECRET");
    const authHeader = req.headers.get("Authorization");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, anonKey);

    let actorUserId: string | null = null;
    let callerCompanyId: string | null = null;
    let invocationMode: "manual" | "scheduler" = "manual";

    if (configuredCronSecret && cronSecret === configuredCronSecret) {
      invocationMode = "scheduler";
    } else {
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
      const user = userData.user;
      if (userErr || !user) return json({ error: "Unauthorized" }, 401);
      actorUserId = user.id;

      const { data: roleRows } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["office", "admin"])
        .limit(1);
      if (!roleRows || roleRows.length === 0) return json({ error: "Forbidden" }, 403);

      const { data: companyRows, error: companyError } = await adminClient.rpc("get_user_company_id", { _user_id: user.id });
      if (companyError) return json({ error: companyError.message }, 500);
      callerCompanyId = companyRows ?? null;
      if (!callerCompanyId) return json({ error: "Forbidden: user is not linked to a company" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body.dry_run);
    const nowIso = new Date().toISOString();
    const emailDeliveryEnabled = Deno.env.get("CLIENT_EMAIL_DELIVERY_ENABLED") === "true";

    let rows: CadenceRow[] = [];
    if (invocationMode === "manual") {
      const { data: clientRows, error: clientErr } = await adminClient
        .from("clients")
        .select("id")
        .eq("company_id", callerCompanyId);
      if (clientErr) return json({ error: clientErr.message }, 500);

      const clientIds = (clientRows ?? []).map((row) => row.id);
      if (clientIds.length === 0) return json({ success: true, dry_run: dryRun, processed: [] });

      const chunkedRows: CadenceRow[] = [];
      for (const clientIdChunk of chunkArray(clientIds, 100)) {
        const { data: chunkRows, error: chunkError } = await adminClient
          .from("notification_cadence")
          .select("id, client_id, entity_type, entity_id, notification_type, scheduled_for, sent_at, throttle_key")
          .is("sent_at", null)
          .lte("scheduled_for", nowIso)
          .in("client_id", clientIdChunk)
          .order("scheduled_for", { ascending: true })
          .limit(50);
        if (chunkError) return json({ error: chunkError.message }, 500);
        chunkedRows.push(...((chunkRows ?? []) as CadenceRow[]));
      }

      rows = chunkedRows
        .sort((left, right) => new Date(left.scheduled_for).getTime() - new Date(right.scheduled_for).getTime())
        .slice(0, 50);
    } else {
      const { data: schedulerRows, error: cadenceError } = await adminClient
        .from("notification_cadence")
        .select("id, client_id, entity_type, entity_id, notification_type, scheduled_for, sent_at, throttle_key")
        .is("sent_at", null)
        .lte("scheduled_for", nowIso)
        .order("scheduled_for", { ascending: true })
        .limit(50);
      if (cadenceError) return json({ error: cadenceError.message }, 500);
      rows = (schedulerRows ?? []) as CadenceRow[];
    }

    const processed: Array<{ id: string; status: string; reason?: string }> = [];

    for (const row of rows) {
      const { data: client } = await adminClient
        .from("clients")
        .select("id, company_id, name, email")
        .eq("id", row.client_id)
        .maybeSingle();

      if (!client) {
        processed.push({ id: row.id, status: "skipped", reason: "Client not found" });
        continue;
      }

      if (invocationMode === "manual" && client.company_id !== callerCompanyId) {
        processed.push({ id: row.id, status: "skipped", reason: "Cross-company row blocked" });
        continue;
      }

      if (row.notification_type === "estimate_batch_send" && row.entity_type === "estimate" && row.entity_id) {
        if (!dryRun) {
          const result = await processEstimateBatchSend(adminClient, { estimateId: row.entity_id, actorUserId, emailDeliveryEnabled });
          if (result.status !== "failed" && result.status !== "disabled") {
            await adminClient.from("notification_cadence").update({ sent_at: nowIso }).eq("id", row.id);
          }
          processed.push({ id: row.id, status: result.status, reason: result.reason });
          continue;
        }

        processed.push({ id: row.id, status: "due" });
        continue;
      }

      const { data: throttle } = await adminClient
        .from("notification_throttles")
        .select("id, client_id, throttle_key, last_sent_at")
        .eq("client_id", row.client_id)
        .eq("throttle_key", row.throttle_key)
        .maybeSingle();

      if (isCollectionsNotification(row.notification_type) && shouldThrottle((throttle as ThrottleRow | null)?.last_sent_at, row.scheduled_for)) {
        processed.push({ id: row.id, status: "throttled", reason: "72h client collections throttle active" });
        continue;
      }

      const entityLabel = await loadEntityLabel(adminClient, row);
      const copy = buildReminderDeliveryCopy({
        notificationType: row.notification_type as "estimate_reminder_24h" | "estimate_reminder_72h" | "estimate_reminder_7d" | "invoice_reminder_3d_before_due" | "invoice_reminder_due_date" | "invoice_reminder_7d_overdue" | "invoice_reminder_14d_overdue" | "invoice_weekly_statement",
        clientName: client.name ?? null,
        entityLabel,
      });

      if (!dryRun) {
        let providerStatus: "sent" | "failed" | "not_configured" | "disabled" = "not_configured";
        let providerMessage = "Reminder logged without email provider";
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        const fromEmail = Deno.env.get("REMINDER_EMAIL_FROM") ?? "RugBoost <no-reply@rugboost.local>";
        const recipientEmail = normalizeEmail(client.email ?? null);

        if (!emailDeliveryEnabled) {
          providerStatus = "disabled";
          providerMessage = "Client email delivery is disabled until onboarding is complete";
        } else if (resendApiKey && recipientEmail) {
          if (!isValidEmail(recipientEmail)) {
            providerStatus = "failed";
            providerMessage = `Client email is invalid: ${recipientEmail}`;
          } else {
            const resendResp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: fromEmail,
                to: [recipientEmail],
                subject: copy.subject,
                text: copy.body,
              }),
            });
            const resendPayload = await readResponseBody(resendResp);
            providerStatus = resendResp.ok ? "sent" : "failed";
            providerMessage = resendResp.ok ? "Reminder email delivered" : describeProviderFailure("Resend", resendResp.status, resendPayload);
          }
        }

        if (providerStatus !== "disabled") {
          const { data: thread } = await adminClient
            .from("message_threads")
            .select("id")
            .eq("client_id", row.client_id)
            .eq("thread_type", row.entity_type)
            .eq("entity_id", row.entity_id)
            .limit(1)
            .maybeSingle();

          if (thread?.id) {
            await adminClient.from("messages").insert({
              thread_id: thread.id,
              sender: null,
              body: `${copy.subject}\n\n${copy.body}\n\nDelivery status: ${providerMessage}`,
              attachments: [],
            });
          }

          await adminClient.from("communication_events").insert({
            client_id: row.client_id,
            estimate_id: row.entity_type === "estimate" ? row.entity_id : null,
            invoice_id: row.entity_type === "invoice" ? row.entity_id : null,
            channel: "email",
            direction: "outbound",
            event_type: providerStatus === "failed" ? `${row.notification_type}_failed` : row.notification_type,
            subject: copy.subject,
            body: `${copy.body}\n\nProvider: ${providerStatus} · ${providerMessage}`,
            sent_to: recipientEmail || null,
            created_by: actorUserId,
          });
        }

        if (providerStatus !== "failed" && providerStatus !== "disabled") {
          await adminClient.from("notification_cadence").update({ sent_at: nowIso }).eq("id", row.id);

          if (throttle) {
            await adminClient.from("notification_throttles").update({ last_sent_at: nowIso }).eq("id", (throttle as ThrottleRow).id);
          } else {
            await adminClient.from("notification_throttles").insert({
              client_id: row.client_id,
              throttle_key: row.throttle_key,
              last_sent_at: nowIso,
            });
          }
        }

        processed.push({ id: row.id, status: providerStatus, reason: providerMessage });
        continue;
      }

      processed.push({ id: row.id, status: "due" });
    }

    return json({ success: true, dry_run: dryRun, mode: invocationMode, processed });
  } catch (error) {
    console.error(error);
    return json({ error: "Internal server error" }, 500);
  }
});
