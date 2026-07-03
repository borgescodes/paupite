// Edge Function: push-subscriptions
// Gerencia assinaturas Web Push do usuário autenticado.
// Ações: public-key | status | subscribe | unsubscribe
import { authenticate, corsHeaders, errorResponse, HttpError, json } from "../_shared/paupite.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? (await safeJsonAction(req));

    // public-key não exige auth para permitir carga precoce no cliente.
    if (action === "public-key") {
      const pub = Deno.env.get("VAPID_PUBLIC_KEY");
      if (!pub) throw new HttpError(500, "VAPID_PUBLIC_KEY não configurada.");
      return json({ public_key: pub });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

    const { user, admin } = await authenticate(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const act = String(body.action ?? action ?? "");

    if (act === "status") {
      const endpoint = strOrNull(body.endpoint);
      let q = admin
        .from("push_subscriptions")
        .select("id,endpoint,enabled,created_at,last_success_at,last_failure_at,platform")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (endpoint) q = q.eq("endpoint", endpoint);
      const { data, error } = await q;
      if (error) throw new HttpError(500, error.message);
      return json({ subscriptions: data ?? [] });
    }

    if (act === "subscribe") {
      const endpoint = requireStr(body.endpoint, "endpoint", 2000);
      const p256dh = requireStr(body.p256dh, "p256dh", 512);
      const auth = requireStr(body.auth, "auth", 512);
      const expiration_time =
        typeof body.expiration_time === "number" ? body.expiration_time : null;
      const user_agent = strOrNull(body.user_agent)?.slice(0, 500) ?? null;
      const platform = strOrNull(body.platform)?.slice(0, 100) ?? null;

      // Se endpoint pertencer a outro usuário, reassocia com segurança.
      const { data: existing } = await admin
        .from("push_subscriptions")
        .select("id,user_id")
        .eq("endpoint", endpoint)
        .maybeSingle();

      if (existing && existing.user_id !== user.id) {
        const { error: updErr } = await admin
          .from("push_subscriptions")
          .update({
            user_id: user.id,
            p256dh,
            auth,
            expiration_time,
            user_agent,
            platform,
            enabled: true,
            failure_count: 0,
          })
          .eq("id", existing.id);
        if (updErr) throw new HttpError(500, updErr.message);
        return json({ ok: true, id: existing.id, reassigned: true });
      }

      const { data, error } = await admin
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            endpoint,
            p256dh,
            auth,
            expiration_time,
            user_agent,
            platform,
            enabled: true,
            failure_count: 0,
          },
          { onConflict: "endpoint" },
        )
        .select("id")
        .single();
      if (error) throw new HttpError(500, error.message);
      return json({ ok: true, id: data?.id });
    }

    if (act === "unsubscribe") {
      const endpoint = requireStr(body.endpoint, "endpoint", 2000);
      const { error } = await admin
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("endpoint", endpoint);
      if (error) throw new HttpError(500, error.message);
      return json({ ok: true });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (error) {
    return errorResponse(error);
  }
});

async function safeJsonAction(req: Request): Promise<string | null> {
  try {
    const clone = req.clone();
    const b = (await clone.json()) as { action?: string };
    return b?.action ?? null;
  } catch {
    return null;
  }
}

function requireStr(v: unknown, name: string, max: number): string {
  if (typeof v !== "string" || v.length === 0) throw new HttpError(400, `${name} obrigatório.`);
  if (v.length > max) throw new HttpError(400, `${name} muito longo.`);
  return v;
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
