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

type PortalUserWithClient = {
  id: string;
  client_id: string;
  email: string;
  status: string;
  onboarding_completed_at: string | null;
  clients?: {
    name: string;
    contact_name: string;
    phone: string;
    address: string;
  } | null;
};

type CredentialProvisioningResult = {
  mode: "created" | "updated";
};
type DeliveryInstructions = {
  portal_url: string;
  email: string;
  reset_link: string | null;
  temporary_password: string;
  note: string | null;
};

const WHOLESALE_BOOTSTRAP_PASSWORD = "Rugboost!";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const findAuthUserIdByEmail = async (
  adminClient: ReturnType<typeof createClient>,
  email: string
) => {
  const normalizedEmail = email.toLowerCase();
  let page = 1;
  const perPage = 200;

  while (page <= 10) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const users = data?.users ?? [];
    const match = users.find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (match?.id) return match.id;

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
};

const ensurePortalUserCredentials = async (
  adminClient: ReturnType<typeof createClient>,
  email: string,
  fullName: string,
  bootstrapPassword: string
): Promise<CredentialProvisioningResult> => {
  const { data: profileRows, error: existingProfileError } = await adminClient
    .from("profiles")
    .select("user_id")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1);
  if (existingProfileError) throw new Error(existingProfileError.message);

  let existingUserId = profileRows?.[0]?.user_id ?? null;
  if (!existingUserId) {
    // Some legacy records can exist in auth.users without a profiles row.
    existingUserId = await findAuthUserIdByEmail(adminClient, email);
  }

  if (existingUserId) {
    const { error: updateUserError } = await adminClient.auth.admin.updateUserById(existingUserId, {
      email,
      password: bootstrapPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, must_change_password: true },
    });
    if (updateUserError) throw new Error(updateUserError.message);

    const { error: profileUpsertError } = await adminClient
      .from("profiles")
      .upsert({ user_id: existingUserId, full_name: fullName, email }, { onConflict: "user_id" });
    if (profileUpsertError) throw new Error(profileUpsertError.message);

    return { mode: "updated" };
  }

  const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password: bootstrapPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, must_change_password: true },
  });
  if (createUserError || !createdUser.user?.id) {
    throw new Error(createUserError?.message ?? "Failed to create portal login.");
  }

  const { error: profileUpsertError } = await adminClient
    .from("profiles")
    .upsert({ user_id: createdUser.user.id, full_name: fullName, email }, { onConflict: "user_id" });
  if (profileUpsertError) throw new Error(profileUpsertError.message);

  return { mode: "created" };
};

const buildPortalUrl = (req: Request) => {
  const normalize = (rawValue: string | null | undefined) => {
    if (!rawValue) return null;
    try {
      const parsed = new URL(rawValue);
      const pathname = parsed.pathname.replace(/\/+$/, "");
      if (pathname.endsWith("/portal")) return `${parsed.origin}${pathname}`;
      return `${parsed.origin}/portal`;
    } catch {
      return null;
    }
  };

  const envPortalUrl = normalize(Deno.env.get("PORTAL_APP_URL"));
  if (envPortalUrl) return envPortalUrl;

  const originPortalUrl = normalize(req.headers.get("origin"));
  if (originPortalUrl) return originPortalUrl;

  const refererPortalUrl = normalize(req.headers.get("referer"));
  if (refererPortalUrl) return refererPortalUrl;

  // Last resort fallback if no origin/referer/env is available.
  return "https://mr.rugboost.com/portal";
};

const buildResetRedirectUrl = (portalUrl: string) => `${portalUrl}/auth/reset-password`;

const generateBootstrapPassword = () => WHOLESALE_BOOTSTRAP_PASSWORD;

const generatePasswordResetLink = async (
  adminClient: ReturnType<typeof createClient>,
  email: string,
  portalUrl: string
) => {
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: buildResetRedirectUrl(portalUrl),
    },
  });

  if (error) throw new Error(error.message);

  return data.properties?.action_link ?? null;
};

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
    const actor = userData.user;

    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", actor.id)
      .in("role", ["admin", "office"])
      .limit(1);
    if (roleError) return json({ error: roleError.message }, 500);
    if (!roleRows || roleRows.length === 0) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const portalUserId = typeof body?.portal_user_id === "string" ? body.portal_user_id : "";
    if (!portalUserId) return json({ error: "portal_user_id is required" }, 400);

    const { data: portalUser, error: portalUserError } = await adminClient
      .from("portal_users")
      .select("id, client_id, email, status, onboarding_completed_at, clients(name, contact_name, phone, address)")
      .eq("id", portalUserId)
      .single();
    if (portalUserError || !portalUser) return json({ error: "Portal user not found" }, 404);

    const typedPortalUser = portalUser as unknown as PortalUserWithClient;
    if (typedPortalUser.status !== "active") {
      return json({ error: "Portal user must be active before sending onboarding email" }, 400);
    }

    const portalUrl = buildPortalUrl(req);
    const contactName =
      typedPortalUser.clients?.contact_name?.trim() ||
      typedPortalUser.clients?.name?.trim() ||
      "there";
    const bootstrapPassword = generateBootstrapPassword();
    await ensurePortalUserCredentials(
      adminClient,
      typedPortalUser.email,
      typedPortalUser.clients?.contact_name?.trim() || typedPortalUser.clients?.name?.trim() || "Portal User",
      bootstrapPassword
    );

    const { error: portalFlagError } = await adminClient
      .from("portal_users")
      .update({ must_change_password: true })
      .eq("id", typedPortalUser.id);
    if (portalFlagError) return json({ error: portalFlagError.message }, 500);

    const resetLink = await generatePasswordResetLink(adminClient, typedPortalUser.email, portalUrl);
    const setPasswordLink = resetLink || `${portalUrl}/auth/forgot-password`;

    const subject = `RugBoost portal login instructions`;
    const bodyText = [
      `Hello ${contactName},`,
      "",
      "Your RugBoost wholesale portal account is active.",
      "",
      "Sign-in steps:",
      `1) Use this temporary password to sign in once: ${WHOLESALE_BOOTSTRAP_PASSWORD}`,
      `2) Immediately set your own new password here: ${setPasswordLink}`,
      `3) Enter your account email: ${typedPortalUser.email}`,
      "4) Password change is required before continuing. There is no bypass.",
      `5) After changing password, sign in at ${portalUrl} and complete onboarding.`,
      "",
      "Need help? Reply to this email and our team will help immediately.",
    ].join("\n");
    const bodyHtml = [
      `<p>Hello ${escapeHtml(contactName)},</p>`,
      "<p>Your RugBoost wholesale portal account is active.</p>",
      "<p><strong>Sign-in steps</strong></p>",
      "<ol>",
      `<li>Use this temporary password to sign in once: <strong>${escapeHtml(WHOLESALE_BOOTSTRAP_PASSWORD)}</strong></li>`,
      `<li>Immediately set your own new password here: <a href="${escapeHtml(setPasswordLink)}">${escapeHtml(setPasswordLink)}</a></li>`,
      `<li>Enter your account email: <strong>${escapeHtml(typedPortalUser.email)}</strong></li>`,
      "<li><strong>Password change is required before continuing.</strong> There is no bypass.</li>",
      `<li>After changing password, sign in at <a href="${escapeHtml(portalUrl)}">${escapeHtml(portalUrl)}</a> and complete onboarding.</li>`,
      "</ol>",
      "<p>Need help? Reply to this email and our team will help immediately.</p>",
    ].join("");
    const deliveryInstructions: DeliveryInstructions = {
      portal_url: portalUrl,
      email: typedPortalUser.email,
      reset_link: resetLink,
      temporary_password: WHOLESALE_BOOTSTRAP_PASSWORD,
      note: "Temporary password works once; user must set a new password before continuing.",
    };

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("PORTAL_ONBOARDING_EMAIL_FROM") ?? "RugBoost <no-reply@rugboost.local>";

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
          to: [typedPortalUser.email],
          subject,
          text: bodyText,
          html: bodyHtml,
        }),
      });

      providerResponse = await resendResp.json().catch(() => null);
      providerStatus = resendResp.ok ? "sent" : "failed";

      if (!resendResp.ok) {
        await adminClient.from("communication_events").insert({
          client_id: typedPortalUser.client_id,
          channel: "email",
          direction: "outbound",
          event_type: "portal_onboarding_email_failed",
          subject,
          body: bodyText,
          sent_to: typedPortalUser.email,
        });
        return json({
          success: true,
          provider_status: providerStatus,
          provider_response: providerResponse,
          delivery_instructions: deliveryInstructions,
        });
      }
    }

    await adminClient.from("communication_events").insert({
      client_id: typedPortalUser.client_id,
      channel: "email",
      direction: "outbound",
      event_type: "portal_onboarding_email_sent",
      subject,
      body: bodyText,
      sent_to: typedPortalUser.email,
    });

    await adminClient.from("audit_log").insert({
      user_id: actor.id,
      user_name: actor.email ?? "System",
      action: `Processed wholesale onboarding email for ${typedPortalUser.email} (${providerStatus})`,
    });

    return json({
      success: true,
      provider_status: providerStatus,
      provider_response: providerResponse,
      delivery_instructions: deliveryInstructions,
    });
  } catch (error) {
    console.error(error);
    return json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown failure",
      },
      500
    );
  }
});
