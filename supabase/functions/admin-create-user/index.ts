// Edge Function: admin-create-user
// Cria usuário no Supabase Auth já com senha inicial definida pelo admin.
// Não envia email, não gera link de convite. Apenas superadmin/admin ativos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  email: string;
  display_name: string;
  nickname: string;
  role?: "admin" | "player";
  initial_password: string;
}

interface ProfileRole {
  id?: string;
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

    const { data: callerProfileRaw, error: callerErr } = await admin
      .from("profiles")
      .select("role,status")
      .eq("id", userData.user.id)
      .maybeSingle();
    const callerProfile = callerProfileRaw as ProfileRole | null;
    if (callerErr) return json({ error: callerErr.message }, 500);
    if (!callerProfile || callerProfile.status !== "active") {
      return json({ error: "Apenas usuários ativos podem criar usuários." }, 403);
    }
    if (!isAdminRole(callerProfile.role)) {
      return json({ error: "Você não tem permissão para criar usuários." }, 403);
    }

    const body = (await req.json()) as Payload;
    const targetRole = body.role ?? "player";
    const email = body.email?.trim().toLowerCase();
    const initialPassword = body.initial_password ?? "";

    if (!email || !body.display_name?.trim() || !body.nickname?.trim()) {
      return json({ error: "Informe email, nome e apelido." }, 400);
    }
    if (!initialPassword || initialPassword.length < 8) {
      return json({ error: "A senha inicial precisa ter pelo menos 8 caracteres." }, 400);
    }
    if (!canCreateRole(callerProfile.role, targetRole)) {
      return json({ error: "Você não tem permissão para criar usuário com essa role." }, 403);
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: {
        display_name: body.display_name,
        nickname: body.nickname,
        role: targetRole,
      },
    });
    if (createErr) return json({ error: createErr.message }, 400);

    const now = new Date().toISOString();
    const { error: profileErr } = await admin
      .from("profiles")
      .upsert({
        id: created.user!.id,
        email,
        display_name: body.display_name,
        nickname: body.nickname,
        role: targetRole,
        status: "active",
        must_change_password: true,
        first_access_completed_at: null,
        last_password_reset_at: null,
        temporary_password_set_at: now,
      });
    if (profileErr) return json({ error: profileErr.message }, 400);

    return json({
      user_id: created.user!.id,
      email,
    });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isAdminRole(role: string) {
  return role === "superadmin" || role === "admin";
}

function canCreateRole(callerRole: string, targetRole: string) {
  if (callerRole === "superadmin") return targetRole === "admin" || targetRole === "player";
  if (callerRole === "admin") return targetRole === "player";
  return false;
}
