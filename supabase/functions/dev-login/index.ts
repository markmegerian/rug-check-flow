import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TEST_PASSWORD = "TestPass123!";

const ROLE_EMAILS: Record<string, string> = {
  admin: "test-admin@rugboost.local",
  office: "test-office@rugboost.local",
  checkin_staff: "test-checkin@rugboost.local",
  driver: "test-driver@rugboost.local",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // Require a dev secret to prevent unauthorized access
    const devSecret = Deno.env.get("DEV_LOGIN_SECRET");
    if (!devSecret) {
      return new Response(JSON.stringify({ error: "Dev login is disabled" }), {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { role } = body;

    if (!role || !ROLE_EMAILS[role]) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const email = ROLE_EMAILS[role];

    // Check if user exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    let userId: string | undefined;
    const existing = existingUsers?.users?.find((u: { email?: string }) => u.email === email);

    if (existing) {
      userId = existing.id;
    } else {
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: `Test ${role.replace("_", " ")}` },
      });
      if (createErr) throw createErr;
      userId = newUser.user.id;
    }

    // Ensure role is assigned
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", role)
      .maybeSingle();

    if (!existingRole) {
      await supabase.from("user_roles").insert({ user_id: userId, role });
    }

    return new Response(
      JSON.stringify({ email, password: TEST_PASSWORD }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
