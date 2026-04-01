import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function buildReminderCopy(row: CadenceRow, clientName?: string | null, entityLabel?: string | null) {
  const subjectBase = entityLabel ?? row.entity_id ?? row.entity_type;
  switch (row.notification_type) {
    case "estimate_reminder_24h":
      return {
        subject: `Estimate follow-up: ${subjectBase}`,
        body: `Hello ${clientName ?? "there"},\n\nJust following up on ${subjectBase}. We sent this estimate yesterday and wanted to make sure you had what you need to review it.`,
      };
    case "estimate_reminder_72h":
      return {
        subject: `Estimate reminder: ${subjectBase}`,
        body: `Hello ${clientName ?? "there"},\n\nThis is a 72-hour follow-up on ${subjectBase}. Let us know if you have any questions or if you'd like us to proceed.`,
      };
    case "estimate_reminder_7d":
      return {
        subject: `Final estimate follow-up: ${subjectBase}`,
        body: `Hello ${clientName ?? "there"},\n\nThis is a final automated follow-up on ${subjectBase}. Reply in the portal if you'd like to move forward or need changes.`,
      };
    case "invoice_reminder_3d_before_due":
      return {
        subject: `Invoice due soon: ${subjectBase}`,
        body: `Hello ${clientName ?? "there"},\n\nA quick reminder that ${subjectBase} is due in 3 days.`,
      };
    case "invoice_reminder_due_date":
      return {
        subject: `Invoice due today: ${subjectBase}`,
        body: `Hello ${clientName ?? "there"},\n\n${subjectBase} is due today. Please review the balance at your earliest convenience.`,
      };
    case "invoice_reminder_7d_overdue":
      return {
        subject: `Invoice overdue: ${subjectBase}`,
        body: `Hello ${clientName ?? "there"},\n\n${subjectBase} is now 7 days overdue. Please reply if there is an issue we should know about.`,
      };
    case "invoice_reminder_14d_overdue":
      return {
        subject: `Second overdue reminder: ${subjectBase}`,
        body: `Hello ${clientName ?? "there"},\n\n${subjectBase} is now 14 days overdue. Please contact us if you need help resolving the balance.`,
      };
    case "invoice_weekly_statement":
      return {
        subject: `Weekly account statement: ${subjectBase}`,
        body: `Hello ${clientName ?? "there"},\n\nThis is your weekly automated statement reminder for ${subjectBase}.`,
      };
    default:
      return {
        subject: `Reminder: ${subjectBase}`,
        body: `Hello ${clientName ?? "there"},\n\nThis is an automated reminder regarding ${subjectBase}.`,
      };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, anonKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
    const user = userData.user;
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: roleRows } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["office", "admin"])
      .limit(1);
    if (!roleRows || roleRows.length === 0) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body.dry_run);
    const nowIso = new Date().toISOString();

    const { data: rows, error: cadenceError } = await adminClient
      .from("notification_cadence")
      .select("id, client_id, entity_type, entity_id, notification_type, scheduled_for, sent_at, throttle_key")
      .is("sent_at", null)
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (cadenceError) return json({ error: cadenceError.message }, 500);

    const processed: Array<{ id: string; status: string; reason?: string }> = [];

    for (const row of (rows ?? []) as CadenceRow[]) {
      const { data: client } = await adminClient
        .from("clients")
        .select("id, name, email")
        .eq("id", row.client_id)
        .maybeSingle();

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

      const copy = buildReminderCopy(row, client?.name ?? null, row.entity_id);

      if (!dryRun) {
        await adminClient.from("communication_events").insert({
          client_id: row.client_id,
          estimate_id: row.entity_type === "estimate" ? row.entity_id : null,
          invoice_id: row.entity_type === "invoice" ? row.entity_id : null,
          channel: "email",
          direction: "outbound",
          event_type: row.notification_type,
          subject: copy.subject,
          body: copy.body,
          sent_to: client?.email ?? null,
          created_by: user.id,
        });

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

      processed.push({ id: row.id, status: dryRun ? "due" : "sent" });
    }

    return json({ success: true, dry_run: dryRun, processed });
  } catch (error) {
    console.error(error);
    return json({ error: "Internal server error" }, 500);
  }
});
