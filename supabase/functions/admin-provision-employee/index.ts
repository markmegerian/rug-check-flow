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

function isValidRole(value: unknown): value is AppRole {
  return typeof value === "string" && VALID_ROLES.has(value as AppRole);
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
    const actor = userData.user;

    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", actor.id)
      .eq("role", "admin")
      .limit(1);
    if (roleError) return json({ error: roleError.message }, 500);
    if (!roleRows || roleRows.length === 0) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
    const password = typeof body?.password === "string" ? body.password.trim() : "";
    const role = body?.role;

    if (!email) return json({ error: "email is required" }, 400);
    if (!fullName) return json({ error: "full_name is required" }, 400);
    if (password.length < 8) return json({ error: "password must be at least 8 characters" }, 400);
    if (!isValidRole(role)) return json({ error: "role is invalid" }, 400);

    const { data: existingProfile } = await adminClient
      .from("profiles")
      .select("user_id")
      .ilike("email", email)
      .maybeSingle();

    let targetUserId = existingProfile?.user_id ?? null;
    let reusedExistingUser = Boolean(targetUserId);

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

    await adminClient.from("audit_log").insert({
      user_id: actor.id,
      user_name: actor.email ?? "Admin",
      action: `Provisioned employee ${email} with role ${role}`,
    });

    return json({
      success: true,
      user_id: targetUserId,
      email,
      role,
      reused_existing_user: reusedExistingUser,
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Internal server error" }, 500);
  }
});
