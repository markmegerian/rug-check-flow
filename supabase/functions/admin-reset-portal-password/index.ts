import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type JwtPayload = {
  role?: string;
};

type PortalUserRecord = {
  id: string;
  email: string;
  status: string;
  client_id?: string | null;
  clients?: {
    name?: string | null;
    contact_name?: string | null;
  } | null;
};

const decodeJwtPayload = (token: string): JwtPayload | null => {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
};

const findAuthUserIdByEmail = async (
  adminClient: ReturnType<typeof createClient>,
  email: string,
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

const findSinglePortalUserByEmail = async (
  adminClient: ReturnType<typeof createClient>,
  email: string,
): Promise<PortalUserRecord> => {
  const { data, error } = await adminClient
    .from("portal_users")
    .select("id, client_id, email, status, clients(name, contact_name)")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(2);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as PortalUserRecord[];
  if (rows.length === 0) {
    throw new Error("Portal user not found");
  }
  if (rows.length > 1) {
    throw new Error("Multiple portal users found for that email. Resolve the duplicate portal records before resetting access.");
  }

  return rows[0];
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
    const token = authHeader.replace("Bearer ", "").trim();
    const jwtPayload = decodeJwtPayload(token);
    const isServiceRole = jwtPayload?.role === "service_role";

    let actor: { id: string; email?: string | null } | null = null;

    if (!isServiceRole) {
      const { data: userData, error: userError } = await anonClient.auth.getUser(token);
      if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
      actor = userData.user;

      const { data: roleRows, error: roleError } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .in("role", ["admin", "office"])
        .limit(1);
      if (roleError) return json({ error: roleError.message }, 500);
      if (!roleRows || roleRows.length === 0) return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password) return json({ error: "email and password are required" }, 400);
    if (password.trim().length < 8) {
      return json({ error: "password must be at least 8 characters" }, 400);
    }

    let portalUser: PortalUserRecord;
    try {
      portalUser = await findSinglePortalUserByEmail(adminClient, email);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown portal lookup failure";
      const status = message === "Portal user not found" ? 404 : 409;
      return json({ error: message }, status);
    }

    const displayName = portalUser.clients?.contact_name?.trim() || portalUser.clients?.name?.trim() || "Portal User";
    const existingUserId = await findAuthUserIdByEmail(adminClient, email);

    if (existingUserId) {
      const { error: updateUserError } = await adminClient.auth.admin.updateUserById(existingUserId, {
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: displayName,
          must_change_password: true,
        },
      });
      if (updateUserError) return json({ error: updateUserError.message }, 500);

      const { error: profileError } = await adminClient
        .from("profiles")
        .upsert({ user_id: existingUserId, full_name: displayName, email }, { onConflict: "user_id" });
      if (profileError) return json({ error: profileError.message }, 500);
    } else {
      const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: displayName,
          must_change_password: true,
        },
      });
      if (createError || !createdUser.user?.id) {
        return json({ error: createError?.message ?? "Failed to create auth user" }, 500);
      }

      const { error: profileError } = await adminClient
        .from("profiles")
        .upsert({ user_id: createdUser.user.id, full_name: displayName, email }, { onConflict: "user_id" });
      if (profileError) return json({ error: profileError.message }, 500);
    }

    const { error: portalUpdateError } = await adminClient
      .from("portal_users")
      .update({ status: "active", must_change_password: true })
      .eq("id", portalUser.id);
    if (portalUpdateError) return json({ error: portalUpdateError.message }, 500);

    await adminClient.from("audit_log").insert({
      user_id: actor?.id ?? null,
      user_name: actor?.email ?? "service_role",
      action: `Reset wholesale portal password for ${email}`,
    });

    return json({
      ok: true,
      email,
      password_set: true,
      portal_status: "active",
      must_change_password: true,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
