// Edge Function: admin-reset-user-password
// Gera link de redefinição de senha. Apenas admins.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return j({ error: "missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return j({ error: "unauthorized" }, 401);

    const { data: isAdmin } = await userClient.rpc("is_admin", { _user_id: userData.user.id });
    if (!isAdmin) return j({ error: "forbidden" }, 403);

    const { email } = (await req.json()) as { email: string };
    if (!email) return j({ error: "missing email" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (error) return j({ error: error.message }, 400);

    return j({ action_link: data.properties?.action_link });
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});

function j(p: unknown, s = 200) {
  return new Response(JSON.stringify(p), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
