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

    const { estimate_id } = await req.json();
    if (!estimate_id) return json({ error: "estimate_id is required" }, 400);

    const { data: estimate, error: estErr } = await adminClient
      .from("estimates")
      .select("id, estimate_number, status, total, client_id, rug_id, clients(name,email), rugs(tag)")
      .eq("id", estimate_id)
      .single();

    if (estErr || !estimate) return json({ error: "Estimate not found" }, 404);
    if (!estimate.clients?.email) return json({ error: "Client email is missing" }, 400);

    const priorStatus = estimate.status as string;
    const nowIso = new Date().toISOString();
    const eventType = priorStatus === "sent" ? "estimate_resent" : "estimate_sent";

    if (priorStatus === "draft") {
      await adminClient
        .from("estimates")
        .update({ status: "sent", sent_at: nowIso })
        .eq("id", estimate.id);
    }

    const subject = `Estimate ${estimate.estimate_number} from RugBoost`;
    const portalUrl = Deno.env.get("PORTAL_APP_URL") ?? "https://mr.rugboost.com/portal";
    const body = [
      `Hello ${estimate.clients?.name ?? "client"},`,
      "",
      `Your estimate ${estimate.estimate_number} is ready.`,
      `Rug: ${estimate.rugs?.tag ?? "N/A"}`,
      `Total: $${Number(estimate.total ?? 0).toFixed(2)}`,
      "",
      `Please sign in to the portal to approve or reject this estimate: ${portalUrl}`,
    ].join("\n");

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("ESTIMATE_EMAIL_FROM") ?? "RugBoost <no-reply@rugboost.local>";

    let providerStatus = "not_configured";
    let providerResponse: unknown = null;

    if (resendApiKey) {
      const resendResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [estimate.clients.email],
          subject,
          text: body,
        }),
      });

      providerResponse = await resendResp.json().catch(() => null);
      providerStatus = resendResp.ok ? "sent" : "failed";

      if (!resendResp.ok) {
        await adminClient.from("communication_events").insert({
          client_id: estimate.client_id,
          rug_id: estimate.rug_id,
          estimate_id: estimate.id,
          channel: "email",
          direction: "outbound",
          event_type: "estimate_send_failed",
          subject,
          body,
          sent_to: estimate.clients.email,
        });
        return json({
          success: true,
          provider_status: providerStatus,
          provider_response: providerResponse,
          action_hint: `Share estimate manually in portal: ${portalUrl}`,
        });
      }
    }

    await adminClient.from("communication_events").insert({
      client_id: estimate.client_id,
      rug_id: estimate.rug_id,
      estimate_id: estimate.id,
      channel: "email",
      direction: "outbound",
      event_type: eventType,
      subject,
      body,
      sent_to: estimate.clients.email,
    });

    return json({
      success: true,
      provider_status: providerStatus,
      provider_response: providerResponse,
      action_hint: `Estimate visible in portal: ${portalUrl}`,
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Internal server error" }, 500);
  }
});
