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

async function processEstimateBatchSend(adminClient: ReturnType<typeof createClient>, params: { estimateId: string; actorUserId: string | null }) {
  const nowIso = new Date().toISOString();
  const { data: estimate, error: estErr } = await adminClient
    .from("estimates")
    .select("id, estimate_number, status, total, client_id, rug_id, clients(name,email), rugs(tag)")
    .eq("id", params.estimateId)
    .single();

  if (estErr || !estimate) return { status: "skipped", reason: "Estimate not found" };
  if (!estimate.client_id) return { status: "failed", reason: "Estimate missing client link" };
  if (estimate.status !== "draft") return { status: "skipped", reason: `Estimate already ${estimate.status}` };

  const portalUrl = Deno.env.get("PORTAL_APP_URL") ?? "https://mr.rugboost.com/portal";
  const subject = `Estimate ${estimate.estimate_number} from RugBoost`;
  const body = [
    `Hello ${estimate.clients?.name ?? "client"},`,
    "",
    `Your estimate ${estimate.estimate_number} is ready.`,
    `Rug: ${estimate.rugs?.tag ?? "N/A"}`,
    `Total: $${Number(estimate.total ?? 0).toFixed(2)}`,
    "",
    `Please sign in to the portal to approve or reject this estimate: ${portalUrl}`,
  ].join("\n");

  const clientEmail = estimate.clients?.email ?? null;
  if (!clientEmail) {
    await adminClient.from("communication_events").insert({
      client_id: estimate.client_id,
      rug_id: estimate.rug_id,
      estimate_id: estimate.id,
      channel: "email",
      direction: "outbound",
      event_type: "estimate_send_failed",
      subject: `Estimate ${estimate.estimate_number} send blocked`,
      body: "Estimate send was blocked because the client email is missing.",
      created_by: params.actorUserId,
    });
    return { status: "failed", reason: "Client email is missing" };
  }

  let providerStatus: "sent" | "failed" | "not_configured" = "not_configured";
  let providerMessage = "Estimate marked sent without email provider";
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("ESTIMATE_EMAIL_FROM") ?? "RugBoost <no-reply@rugboost.local>";

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
    providerStatus = resendResp.ok ? "sent" : "failed";
    providerMessage = resendResp.ok ? "Estimate email delivered" : `Resend failed (${resendResp.status})`;
  }

  if (providerStatus === "failed") {
    await adminClient.from("communication_events").insert({
      client_id: estimate.client_id,
      rug_id: estimate.rug_id,
      estimate_id: estimate.id,
      channel: "email",
      direction: "outbound",
      event_type: "estimate_send_failed",
      subject,
      body,
      sent_to: clientEmail,
      created_by: params.actorUserId,
    });
    return { status: "failed", reason: providerMessage };
  }

  await adminClient.from("estimates").update({ status: "sent", sent_at: nowIso }).eq("id", estimate.id);
  await adminClient.from("notification_cadence").upsert(
    buildEstimateReminderRows({ clientId: estimate.client_id, estimateId: estimate.id, sentAt: nowIso }),
    { onConflict: "client_id,entity_type,entity_id,notification_type" },
  );
  await adminClient.from("communication_events").insert({
    client_id: estimate.client_id,
    rug_id: estimate.rug_id,
    estimate_id: estimate.id,
    channel: "email",
    direction: "outbound",
    event_type: "estimate_sent",
    subject,
    body,
    sent_to: clientEmail,
    created_by: params.actorUserId,
  });

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

    let clientIds: string[] | null = null;
    if (invocationMode === "manual") {
      const { data: clientRows, error: clientErr } = await adminClient
        .from("clients")
        .select("id")
        .eq("company_id", callerCompanyId);
      if (clientErr) return json({ error: clientErr.message }, 500);
      clientIds = (clientRows ?? []).map((row) => row.id);
      if (clientIds.length === 0) return json({ success: true, dry_run: dryRun, processed: [] });
    }

    let cadenceQuery = adminClient
      .from("notification_cadence")
      .select("id, client_id, entity_type, entity_id, notification_type, scheduled_for, sent_at, throttle_key")
      .is("sent_at", null)
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (clientIds) cadenceQuery = cadenceQuery.in("client_id", clientIds);

    const { data: rows, error: cadenceError } = await cadenceQuery;
    if (cadenceError) return json({ error: cadenceError.message }, 500);

    const processed: Array<{ id: string; status: string; reason?: string }> = [];

    for (const row of (rows ?? []) as CadenceRow[]) {
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
          const result = await processEstimateBatchSend(adminClient, { estimateId: row.entity_id, actorUserId });
          await adminClient.from("notification_cadence").update({ sent_at: nowIso }).eq("id", row.id);
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

      const copy = buildReminderDeliveryCopy({
        notificationType: row.notification_type as "estimate_reminder_24h" | "estimate_reminder_72h" | "estimate_reminder_7d" | "invoice_reminder_3d_before_due" | "invoice_reminder_due_date" | "invoice_reminder_7d_overdue" | "invoice_reminder_14d_overdue" | "invoice_weekly_statement",
        clientName: client.name ?? null,
        entityLabel: row.entity_id,
      });

      if (!dryRun) {
        let providerStatus: "sent" | "failed" | "not_configured" = "not_configured";
        let providerMessage = "Reminder logged without email provider";
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        const fromEmail = Deno.env.get("REMINDER_EMAIL_FROM") ?? "RugBoost <no-reply@rugboost.local>";

        if (resendApiKey && client.email) {
          const resendResp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [client.email],
              subject: copy.subject,
              text: copy.body,
            }),
          });
          providerStatus = resendResp.ok ? "sent" : "failed";
          providerMessage = resendResp.ok ? "Reminder email delivered" : `Resend failed (${resendResp.status})`;
        }

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
          sent_to: client.email ?? null,
          created_by: actorUserId,
        });

        if (providerStatus !== "failed") {
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
