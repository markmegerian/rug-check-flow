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

type PasswordStrategy = "zip_plus_last4" | "phone_last4_fallback" | "random_fallback";
type GeneratedPassword = {
  value: string;
  strategy: PasswordStrategy;
};
type CredentialProvisioningResult = {
  temporaryPassword: string | null;
  mode: "created" | "updated" | "existing_internal";
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const extractZipCode = (address: string | null | undefined) => {
  if (!address) return null;
  const match = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match?.[1] ?? null;
};

const extractPhoneLast4 = (phone: string | null | undefined) => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
};

const buildTemporaryPassword = (
  address: string | null | undefined,
  phone: string | null | undefined
): GeneratedPassword => {
  const zip = extractZipCode(address);
  const last4 = extractPhoneLast4(phone);

  if (zip && last4) {
    return { value: `${zip}${last4}`, strategy: "zip_plus_last4" };
  }

  if (last4) {
    return { value: `RugBoost!${last4}`, strategy: "phone_last4_fallback" };
  }

  return {
    value: `RugBoost!${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`,
    strategy: "random_fallback",
  };
};

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
  temporaryPassword: string
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
    const { data: userRoleRows, error: userRoleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", existingUserId)
      .limit(1);
    if (userRoleError) throw new Error(userRoleError.message);
    if ((userRoleRows ?? []).length > 0) {
      // Avoid changing internal staff credentials if this email has app roles.
      return { temporaryPassword: null, mode: "existing_internal" };
    }

    const { error: updateUserError } = await adminClient.auth.admin.updateUserById(existingUserId, {
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (updateUserError) throw new Error(updateUserError.message);

    const { error: profileUpsertError } = await adminClient
      .from("profiles")
      .upsert({ user_id: existingUserId, full_name: fullName, email }, { onConflict: "user_id" });
    if (profileUpsertError) throw new Error(profileUpsertError.message);

    return { temporaryPassword, mode: "updated" };
  }

  const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createUserError || !createdUser.user?.id) {
    throw new Error(createUserError?.message ?? "Failed to create portal login.");
  }

  const { error: profileUpsertError } = await adminClient
    .from("profiles")
    .upsert({ user_id: createdUser.user.id, full_name: fullName, email }, { onConflict: "user_id" });
  if (profileUpsertError) throw new Error(profileUpsertError.message);

  return { temporaryPassword, mode: "created" };
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
    const generatedPassword = buildTemporaryPassword(
      typedPortalUser.clients?.address,
      typedPortalUser.clients?.phone
    );
    const credentials = await ensurePortalUserCredentials(
      adminClient,
      typedPortalUser.email,
      typedPortalUser.clients?.contact_name?.trim() || typedPortalUser.clients?.name?.trim() || "Portal User",
      generatedPassword.value
    );
    const shouldIncludePassword = Boolean(
      credentials.temporaryPassword && typedPortalUser.onboarding_completed_at === null
    );
    const passwordInstruction = shouldIncludePassword
      ? `Password: ${credentials.temporaryPassword}`
      : "Password: Use your existing RugBoost portal password.";
    const firstTimeHint =
      shouldIncludePassword && generatedPassword.strategy === "zip_plus_last4"
        ? "This temporary password is based on ZIP code + last 4 phone digits on file."
        : shouldIncludePassword && generatedPassword.strategy === "phone_last4_fallback"
          ? "Temporary password used a phone-based fallback because ZIP was unavailable."
          : shouldIncludePassword
            ? "Temporary password was auto-generated for secure first sign-in."
            : null;

    const subject = `RugBoost portal login instructions`;
    const bodyText = [
      `Hello ${contactName},`,
      "",
      "Your RugBoost wholesale portal account is active.",
      "",
      "Sign-in steps:",
      `1) Open: ${portalUrl}`,
      `2) Email: ${typedPortalUser.email}`,
      `3) ${passwordInstruction}`,
      "4) Sign in and complete the onboarding guide on first entry.",
      ...(firstTimeHint ? ["", firstTimeHint] : []),
      ...(credentials.mode === "existing_internal"
        ? [
            "",
            "Note: This email address is linked to an existing internal RugBoost account, so password was not reset.",
          ]
        : []),
      "",
      "Need help? Reply to this email and our team will help immediately.",
    ].join("\n");
    const bodyHtml = [
      `<p>Hello ${escapeHtml(contactName)},</p>`,
      "<p>Your RugBoost wholesale portal account is active.</p>",
      "<p><strong>Sign-in steps</strong></p>",
      "<ol>",
      `<li>Open: <a href=\"${escapeHtml(portalUrl)}\">${escapeHtml(portalUrl)}</a></li>`,
      `<li>Email: <strong>${escapeHtml(typedPortalUser.email)}</strong></li>`,
      `<li>${escapeHtml(passwordInstruction)}</li>`,
      "<li>Sign in and complete the onboarding guide on first entry.</li>",
      "</ol>",
      ...(firstTimeHint ? [`<p>${escapeHtml(firstTimeHint)}</p>`] : []),
      ...(credentials.mode === "existing_internal"
        ? [
            "<p><em>Note:</em> This email address is linked to an existing internal RugBoost account, so password was not reset.</p>",
          ]
        : []),
      "<p>Need help? Reply to this email and our team will help immediately.</p>",
    ].join("");

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
        return json({ error: "Email provider failed", details: providerResponse }, 502);
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
      action: `Sent wholesale onboarding email to ${typedPortalUser.email}`,
    });

    return json({ success: true, provider_status: providerStatus, provider_response: providerResponse });
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
