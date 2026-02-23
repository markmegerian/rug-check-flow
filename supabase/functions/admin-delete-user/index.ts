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

const SUPER_ADMIN_EMAILS = new Set(["markmegerian@gmail.com"]);

const isSuperAdminEmail = (email: string | null | undefined) => {
  if (!email) return false;
  return SUPER_ADMIN_EMAILS.has(email.trim().toLowerCase());
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
    const actorIsSuperAdmin = isSuperAdminEmail(actor.email);

    const { data: actorRoleRows, error: actorRoleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", actor.id)
      .eq("role", "admin")
      .limit(1);
    if (actorRoleError) return json({ error: actorRoleError.message }, 500);
    const actorIsAdmin = Boolean(actorRoleRows && actorRoleRows.length > 0);

    if (!actorIsAdmin && !actorIsSuperAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => null);
    const targetUserId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    if (!targetUserId) return json({ error: "user_id is required" }, 400);
    if (targetUserId === actor.id) return json({ error: "Cannot delete your own account from this endpoint." }, 400);

    const { data: targetUserData, error: targetUserError } = await adminClient.auth.admin.getUserById(targetUserId);
    if (targetUserError || !targetUserData.user) return json({ error: "Target user not found." }, 404);
    const targetEmail = targetUserData.user.email ?? null;

    const { data: targetRoleRows, error: targetRoleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId);
    if (targetRoleError) return json({ error: targetRoleError.message }, 500);

    const targetHasAdmin = (targetRoleRows ?? []).some((row) => row.role === "admin");
    if (targetHasAdmin && !actorIsSuperAdmin) {
      return json({ error: "Only superadmin can delete admin users." }, 403);
    }

    const { error: roleDeleteError, count: deletedRoles } = await adminClient
      .from("user_roles")
      .delete({ count: "exact" })
      .eq("user_id", targetUserId);
    if (roleDeleteError) return json({ error: roleDeleteError.message }, 500);

    const { error: profileDeleteError, count: deletedProfiles } = await adminClient
      .from("profiles")
      .delete({ count: "exact" })
      .eq("user_id", targetUserId);
    if (profileDeleteError) return json({ error: profileDeleteError.message }, 500);

    let deletedPortalLinks = 0;
    if (targetEmail) {
      const { error: portalDeleteError, count } = await adminClient
        .from("portal_users")
        .delete({ count: "exact" })
        .ilike("email", targetEmail);
      if (portalDeleteError) return json({ error: portalDeleteError.message }, 500);
      deletedPortalLinks = count ?? 0;
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteUserError) return json({ error: deleteUserError.message }, 500);

    await adminClient.from("audit_log").insert({
      user_id: actor.id,
      user_name: actor.email ?? "Admin",
      action: `Deleted user ${targetEmail ?? targetUserId}`,
    });

    return json({
      success: true,
      user_id: targetUserId,
      email: targetEmail,
      deleted_roles: deletedRoles ?? 0,
      deleted_profiles: deletedProfiles ?? 0,
      deleted_portal_links: deletedPortalLinks,
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Internal server error" }, 500);
  }
});
