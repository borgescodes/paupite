// Edge Function: recalculate-match-points
// Recalcula pontos de uma partida e fecha. Apenas admins.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ProfileRole {
  role: "superadmin" | "admin" | "player";
  status: "invited" | "active" | "disabled";
}

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
    });

    const { data: callerProfileRaw, error: callerErr } = await admin
      .from("profiles")
      .select("role,status")
      .eq("id", userData.user.id)
      .maybeSingle();
    const callerProfile = callerProfileRaw as ProfileRole | null;
    if (callerErr) return j({ error: callerErr.message }, 500);
    if (!callerProfile || callerProfile.status !== "active") {
      return j({ error: "Apenas usuários ativos podem fechar partidas." }, 403);
    }
    if (callerProfile.role !== "superadmin" && callerProfile.role !== "admin") {
      return j({ error: "Você não tem permissão para fechar partidas." }, 403);
    }

    const { match_id } = (await req.json()) as { match_id: string };
    if (!match_id) return j({ error: "Informe a partida." }, 400);

    const { data: match, error: matchErr } = await admin
      .from("matches")
      .select("id,kickoff_at,status")
      .eq("id", match_id)
      .maybeSingle();
    if (matchErr) return j({ error: matchErr.message }, 500);
    if (!match) return j({ error: "Partida não encontrada." }, 404);
    if (new Date(match.kickoff_at) > new Date()) {
      return j({ error: "Não é permitido fechar partida futura." }, 400);
    }
    if (match.status === "scheduled") {
      return j({ error: "Lance o resultado antes de fechar a partida." }, 400);
    }

    const { data, error } = await admin.rpc("admin_recalculate_match_points", {
      _match_id: match_id,
    });
    if (error) return j({ error: error.message }, 400);

    await admin.from("matches").update({ status: "closed" }).eq("id", match_id);
    await admin.from("audit_logs").insert({
      actor_id: userData.user.id,
      action: "match.closed_and_scored",
      entity_type: "match",
      entity_id: match_id,
      metadata: { bets_updated: data },
    });

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
