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

type AppRole = "admin" | "office" | "checkin_staff" | "driver";

const VALID_ROLES = new Set<AppRole>(["admin", "office", "checkin_staff", "driver"]);
const SUPER_ADMIN_EMAILS = new Set(["markmegerian@gmail.com"]);

function isValidRole(value: unknown): value is AppRole {
  return typeof value === "string" && VALID_ROLES.has(value as AppRole);
}

function isSuperAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.has(email.trim().toLowerCase());
}

const buildStaffSignInUrl = (req: Request) => {
  const normalize = (rawValue: string | null | undefined) => {
    if (!rawValue) return null;
    try {
      const parsed = new URL(rawValue);
      const pathname = parsed.pathname.replace(/\/+$/, "");
      if (pathname.endsWith("/auth")) return `${parsed.origin}${pathname}`;
      return `${parsed.origin}/auth`;
    } catch {
      return null;
    }
  };

  const envStaffUrl = normalize(Deno.env.get("STAFF_APP_URL"));
  if (envStaffUrl) return envStaffUrl;

  const envAppUrl = normalize(Deno.env.get("APP_URL"));
  if (envAppUrl) return envAppUrl;

  const originUrl = normalize(req.headers.get("origin"));
  if (originUrl) return originUrl;

  const refererUrl = normalize(req.headers.get("referer"));
  if (refererUrl) return refererUrl;

  return "https://mr.rugboost.com/auth";
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

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
    const actorIsSuperAdmin = isSuperAdminEmail(actor.email);

    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", actor.id)
      .eq("role", "admin")
      .limit(1);
    if (roleError) return json({ error: roleError.message }, 500);
    const actorIsAdmin = Boolean(roleRows && roleRows.length > 0);
    if (!actorIsAdmin && !actorIsSuperAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
    const password = typeof body?.password === "string" ? body.password.trim() : "";
    const role = body?.role;

    if (!email) return json({ error: "email is required" }, 400);
    if (!fullName) return json({ error: "full_name is required" }, 400);
    if (password.length < 8) return json({ error: "password must be at least 8 characters" }, 400);
    if (!isValidRole(role)) return json({ error: "role is invalid" }, 400);
    if (role === "admin" && !actorIsSuperAdmin) {
      return json({ error: "Only superadmin can assign admin role." }, 403);
    }

    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("user_id")
      .ilike("email", email)
      .maybeSingle();

    let targetUserId = existingProfile?.user_id ?? null;
    let reusedExistingUser = Boolean(targetUserId);

    if (targetUserId) {
      const { data: targetRoles, error: targetRolesError } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUserId);
      if (targetRolesError) return json({ error: targetRolesError.message }, 500);
      const targetHasAdmin = (targetRoles ?? []).some((row) => row.role === "admin");
      if (targetHasAdmin && !actorIsSuperAdmin) {
        return json({ error: "Only superadmin can modify admin users." }, 403);
      }
    }

    if (!targetUserId) {
      const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError || !createdUser.user?.id) {
        return json({ error: createError?.message ?? "Failed to create user" }, 400);
      }
      targetUserId = createdUser.user.id;
      reusedExistingUser = false;
    } else {
      const { error: updateUserError } = await adminClient.auth.admin.updateUserById(targetUserId, {
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (updateUserError) {
        return json({ error: updateUserError.message }, 400);
      }
    }

    const { error: profileUpsertError } = await adminClient
      .from("profiles")
      .upsert(
        {
          user_id: targetUserId,
          full_name: fullName,
          email,
        },
        { onConflict: "user_id" }
      );
    if (profileUpsertError) return json({ error: profileUpsertError.message }, 500);

    const { error: roleDeleteError } = await adminClient.from("user_roles").delete().eq("user_id", targetUserId);
    if (roleDeleteError) return json({ error: roleDeleteError.message }, 500);

    const { error: roleInsertError } = await adminClient
      .from("user_roles")
      .insert({ user_id: targetUserId, role });
    if (roleInsertError) return json({ error: roleInsertError.message }, 500);

    const signInUrl = buildStaffSignInUrl(req);
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail =
      Deno.env.get("EMPLOYEE_ONBOARDING_EMAIL_FROM") ??
      Deno.env.get("PORTAL_ONBOARDING_EMAIL_FROM") ??
      "RugBoost <onboarding@resend.dev>";
    const subject = "Your RugBoost staff account is ready";
    const emailText = [
      `Hi ${fullName},`,
      "",
      "Your RugBoost staff account has been provisioned.",
      "",
      "Sign-in steps:",
      `1) Open: ${signInUrl}`,
      `2) Email: ${email}`,
      `3) Temporary password: ${password}`,
      "4) Sign in and update your password if prompted.",
      "",
      `Role assigned: ${role}`,
      "",
      "If anything looks wrong, reply to this email and we will fix it quickly.",
    ].join("\n");
    const emailHtml = [
      `<p>Hi ${escapeHtml(fullName)},</p>`,
      "<p>Your RugBoost staff account has been provisioned.</p>",
      "<p><strong>Sign-in steps</strong></p>",
      "<ol>",
      `<li>Open: <a href="${escapeHtml(signInUrl)}">${escapeHtml(signInUrl)}</a></li>`,
      `<li>Email: <strong>${escapeHtml(email)}</strong></li>`,
      `<li>Temporary password: <strong>${escapeHtml(password)}</strong></li>`,
      "<li>Sign in and update your password if prompted.</li>",
      "</ol>",
      `<p>Role assigned: <strong>${escapeHtml(role)}</strong></p>`,
      "<p>If anything looks wrong, reply to this email and we will fix it quickly.</p>",
    ].join("");

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
          to: [email],
          subject,
          text: emailText,
          html: emailHtml,
        }),
      });

      providerResponse = await resendResp.json().catch(() => null);
      providerStatus = resendResp.ok ? "sent" : "failed";
    }

    if (providerStatus === "failed") {
      await adminClient.from("communication_events").insert({
        channel: "email",
        direction: "outbound",
        event_type: "employee_onboarding_email_failed",
        subject,
        body: emailText,
        sent_to: email,
      });
    } else if (providerStatus === "sent") {
      await adminClient.from("communication_events").insert({
        channel: "email",
        direction: "outbound",
        event_type: "employee_onboarding_email_sent",
        subject,
        body: emailText,
        sent_to: email,
      });
    }

    await adminClient.from("audit_log").insert({
      user_id: actor.id,
      user_name: actor.email ?? "Admin",
      action: `Provisioned employee ${email} with role ${role} (email: ${providerStatus})`,
    });

    return json({
      success: true,
      user_id: targetUserId,
      email,
      role,
      reused_existing_user: reusedExistingUser,
      provider_status: providerStatus,
      provider_response: providerResponse,
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Internal server error" }, 500);
  }
});
