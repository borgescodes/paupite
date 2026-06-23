// Edge Function: recalculate-match-points
// Recalcula pontos de uma partida e fecha. Apenas admins.
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

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "private" },
    });

    // Admin no schema public para verificações / updates fora do schema private
    const adminPublic = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerProfile, error: callerErr } = await adminPublic
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (callerErr) return j({ error: callerErr.message }, 500);
    if (!callerProfile || callerProfile.role !== "admin") return j({ error: "forbidden" }, 403);

    const { match_id } = (await req.json()) as { match_id: string };
    if (!match_id) return j({ error: "missing match_id" }, 400);

    // RPC para função em schema private (service role autorizado)
    const { data, error } = await admin.rpc("recalculate_match_points", { _match_id: match_id });
    if (error) return j({ error: error.message }, 400);

    await adminPublic.from("matches").update({ status: "closed" }).eq("id", match_id);

    return j({ updated: data });
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
