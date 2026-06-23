// Edge Function: complete-password-change
// Finaliza primeiro acesso/reset após supabase.auth.updateUser({ password }).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ProfileRow {
  id: string;
  status: "invited" | "active" | "disabled";
  first_access_completed_at: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profileRaw, error: profileErr } = await admin
      .from("profiles")
      .select("id,status,first_access_completed_at")
      .eq("id", userData.user.id)
      .maybeSingle();
    const profile = profileRaw as ProfileRow | null;

    if (profileErr) return json({ error: profileErr.message }, 500);
    if (!profile) return json({ error: "Profile não encontrado." }, 404);
    if (profile.status === "disabled") return json({ error: "Usuário desativado." }, 403);

    const now = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("profiles")
      .update({
        status: "active",
        must_change_password: false,
        first_access_completed_at: profile.first_access_completed_at ?? now,
        temporary_password_set_at: null,
        last_password_reset_at: now,
      })
      .eq("id", userData.user.id);

    if (updateErr) return json({ error: updateErr.message }, 400);

    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
