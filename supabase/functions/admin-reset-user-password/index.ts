// Edge Function: admin-reset-user-password
// Legado: gera link de redefinição. Mantido apenas para compatibilidade e restrito ao superadmin.
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
      .select("id,role,status")
      .eq("id", userData.user.id)
      .maybeSingle();
    const callerProfile = callerProfileRaw as ProfileRole | null;
    if (callerErr) return j({ error: callerErr.message }, 500);
    if (!callerProfile || callerProfile.status !== "active") {
      return j({ error: "Apenas usuários ativos podem resetar senhas." }, 403);
    }
    if (callerProfile.role !== "superadmin") {
      return j({ error: "Você não tem permissão para resetar senhas." }, 403);
    }

    const { email, redirect_to } = (await req.json()) as { email: string; redirect_to?: string };
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) return j({ error: "Informe o email do usuário." }, 400);

    const { data: targetProfileRaw, error: targetErr } = await admin
      .from("profiles")
      .select("id,role,status")
      .ilike("email", normalizedEmail)
      .maybeSingle();
    const targetProfile = targetProfileRaw as ProfileRole | null;
    if (targetErr) return j({ error: targetErr.message }, 500);
    if (!targetProfile) return j({ error: "Usuário não encontrado." }, 404);
    if (targetProfile.status === "disabled") return j({ error: "Usuário desativado." }, 403);
    if (!canResetRole(callerProfile.role, targetProfile.role)) {
      return j({ error: "Você não tem permissão para resetar a senha desse usuário." }, 403);
    }

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: redirect_to ? { redirectTo: redirect_to } : undefined,
    });
    if (error) return j({ error: error.message }, 400);

    const { error: updateErr } = await admin
      .from("profiles")
      .update({
        must_change_password: true,
        last_password_reset_at: new Date().toISOString(),
      })
      .eq("id", targetProfile.id);
    if (updateErr) return j({ error: updateErr.message }, 400);

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

function canResetRole(callerRole: string, targetRole: string) {
  if (targetRole === "superadmin") return false;
  if (callerRole === "superadmin") return targetRole === "admin" || targetRole === "player";
  return false;
}
