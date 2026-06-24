// Edge Function: admin-set-temp-password
// Define senha temporária respeitando hierarquia e força troca no próximo acesso.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ProfileRole {
  id: string;
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
    if (!authHeader) return json({ error: "missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: callerRaw, error: callerErr } = await admin
      .from("profiles")
      .select("id,role,status")
      .eq("id", userData.user.id)
      .maybeSingle();
    const caller = callerRaw as ProfileRole | null;
    if (callerErr) return json({ error: callerErr.message }, 500);
    if (!caller || caller.status !== "active") return json({ error: "Apenas usuários ativos podem definir senha temporária." }, 403);
    if (caller.role !== "superadmin" && caller.role !== "admin") return json({ error: "Você não tem permissão para definir senha temporária." }, 403);

    const { user_id, temporary_password } = (await req.json()) as { user_id: string; temporary_password: string };
    if (!user_id) return json({ error: "Informe o usuário." }, 400);
    if (!temporary_password || temporary_password.length < 8) return json({ error: "A senha temporária precisa ter pelo menos 8 caracteres." }, 400);
    if (user_id === caller.id) return json({ error: "Você não pode alterar sua própria senha pela área administrativa." }, 403);

    const { data: targetRaw, error: targetErr } = await admin
      .from("profiles")
      .select("id,role,status")
      .eq("id", user_id)
      .maybeSingle();
    const target = targetRaw as ProfileRole | null;
    if (targetErr) return json({ error: targetErr.message }, 500);
    if (!target) return json({ error: "Usuário não encontrado." }, 404);
    if (target.status === "disabled") return json({ error: "Usuário desativado." }, 403);
    if (!canSetPassword(caller.role, target.role)) return json({ error: "Você não tem permissão para definir senha desse usuário." }, 403);

    const { error: authErr } = await admin.auth.admin.updateUserById(user_id, {
      password: temporary_password,
      email_confirm: true,
    });
    if (authErr) return json({ error: authErr.message }, 400);

    const now = new Date().toISOString();
    const { error: profileErr } = await admin
      .from("profiles")
      .update({
        must_change_password: true,
        temporary_password_set_at: now,
        last_password_reset_at: now,
      })
      .eq("id", user_id);
    if (profileErr) return json({ error: profileErr.message }, 400);

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

function canSetPassword(callerRole: string, targetRole: string) {
  if (targetRole === "superadmin") return false;
  if (callerRole === "superadmin") return targetRole === "admin" || targetRole === "player";
  if (callerRole === "admin") return targetRole === "player";
  return false;
}
