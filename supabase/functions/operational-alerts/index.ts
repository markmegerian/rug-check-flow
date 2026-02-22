import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type AlertDispatchResult = {
  attempted: boolean;
  sent: boolean;
  message: string;
};

function buildAlertMessage(counts: { estimates7d: number; pickups7d: number; overdueInvoices7d: number }) {
  return [
    "RugBoost critical operational alert (7+ day backlog)",
    `- Stale estimates: ${counts.estimates7d}`,
    `- Stale pickups: ${counts.pickups7d}`,
    `- Overdue invoices: ${counts.overdueInvoices7d}`,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "Function environment is not fully configured." }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;

    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "office"])
      .limit(1);
    if (roleError) return json({ error: roleError.message }, 500);
    if (!roleRows || roleRows.length === 0) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body.dry_run);
    const criticalDays = typeof body.critical_days === "number" && body.critical_days > 0 ? body.critical_days : 7;
    const cutoffIso = new Date(Date.now() - criticalDays * 24 * 60 * 60 * 1000).toISOString();

    const [estimateCountResult, pickupCountResult, overdueInvoiceCountResult] = await Promise.all([
      adminClient
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .lte("created_at", cutoffIso),
      adminClient
        .from("pickup_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "confirmed", "assigned"])
        .lte("updated_at", cutoffIso),
      adminClient
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue")
        .not("due_at", "is", null)
        .lte("due_at", cutoffIso),
    ]);

    if (estimateCountResult.error) return json({ error: estimateCountResult.error.message }, 500);
    if (pickupCountResult.error) return json({ error: pickupCountResult.error.message }, 500);
    if (overdueInvoiceCountResult.error) return json({ error: overdueInvoiceCountResult.error.message }, 500);

    const criticalCounts = {
      estimates7d: estimateCountResult.count ?? 0,
      pickups7d: pickupCountResult.count ?? 0,
      overdueInvoices7d: overdueInvoiceCountResult.count ?? 0,
    };

    const totalCritical = criticalCounts.estimates7d + criticalCounts.pickups7d + criticalCounts.overdueInvoices7d;
    const shouldAlert = totalCritical > 0;
    const message = buildAlertMessage(criticalCounts);

    const slackResult: AlertDispatchResult = {
      attempted: false,
      sent: false,
      message: "Slack webhook not configured",
    };
    const emailResult: AlertDispatchResult = {
      attempted: false,
      sent: false,
      message: "Email provider not configured",
    };

    if (!dryRun && shouldAlert) {
      const slackWebhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
      if (slackWebhookUrl) {
        slackResult.attempted = true;
        const slackResponse = await fetch(slackWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: message }),
        });
        slackResult.sent = slackResponse.ok;
        slackResult.message = slackResponse.ok
          ? "Slack alert sent"
          : `Slack webhook failed (${slackResponse.status})`;
      }

      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const alertRecipients = (Deno.env.get("OPS_ALERT_EMAILS") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const fromEmail = Deno.env.get("OPS_ALERT_FROM_EMAIL") ?? "RugBoost Alerts <alerts@rugboost.local>";
      if (resendApiKey && alertRecipients.length > 0) {
        emailResult.attempted = true;
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: alertRecipients,
            subject: "RugBoost critical operational alert",
            text: message,
          }),
        });
        emailResult.sent = resendResponse.ok;
        emailResult.message = resendResponse.ok
          ? "Operational alert email sent"
          : `Resend failed (${resendResponse.status})`;
      }

      await adminClient.from("communication_events").insert({
        channel: "email",
        direction: "outbound",
        event_type: "operational_alert_sent",
        subject: "Critical operational reminder alert",
        body: `${message}\n\nSlack: ${slackResult.message}\nEmail: ${emailResult.message}`,
        sent_to: user.email ?? null,
      });
    }

    return json({
      success: true,
      dry_run: dryRun,
      should_alert: shouldAlert,
      critical_days: criticalDays,
      critical_counts: {
        estimates_7d: criticalCounts.estimates7d,
        pickups_7d: criticalCounts.pickups7d,
        overdue_invoices_7d: criticalCounts.overdueInvoices7d,
      },
      slack: slackResult,
      email: emailResult,
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Internal server error" }, 500);
  }
});
