// Edge Function: push-dispatch
// Chamada pelo trigger do banco após INSERT em public.notifications.
// Envia Web Push (VAPID) para todos os dispositivos ativos do destinatário.
// Nunca bloqueia a notificação interna: sempre retorna 200 rápido.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/paupite.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUB = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIV = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUB = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@paupite.app";
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const secret = req.headers.get("x-push-webhook-secret");
    if (!secret || secret !== WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    const body = (await req.json()) as { notification_id?: string };
    const nid = body.notification_id;
    if (!nid) return new Response("bad request", { status: 400 });

    // Carrega notificação real
    const { data: n } = await admin
      .from("notifications")
      .select("id,user_id,title,message,data,type")
      .eq("id", nid)
      .maybeSingle();
    if (!n) return jsonOk({ skipped: "notification not found" });

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth,failure_count")
      .eq("user_id", n.user_id)
      .eq("enabled", true);
    if (!subs || subs.length === 0) return jsonOk({ sent: 0 });

    const url = safeInternalUrl((n.data as Record<string, unknown> | null)?.url) ?? "/";
    const payload = JSON.stringify({
      notification_id: n.id,
      title: n.title || "Pau Pite",
      body: n.message || "",
      url,
      tag: `notification:${n.id}`,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    });

    let sent = 0;
    let failed = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          const res = await sendWebPush(
            { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
            payload,
          );
          if (res.status === 404 || res.status === 410) {
            await admin
              .from("push_subscriptions")
              .update({
                enabled: false,
                failure_count: (s.failure_count ?? 0) + 1,
                last_failure_at: new Date().toISOString(),
              })
              .eq("id", s.id);
            failed++;
            return;
          }
          if (res.status >= 200 && res.status < 300) {
            await admin
              .from("push_subscriptions")
              .update({
                failure_count: 0,
                last_success_at: new Date().toISOString(),
              })
              .eq("id", s.id);
            sent++;
          } else {
            await admin
              .from("push_subscriptions")
              .update({
                failure_count: (s.failure_count ?? 0) + 1,
                last_failure_at: new Date().toISOString(),
              })
              .eq("id", s.id);
            failed++;
          }
        } catch (e) {
          console.error("push send error", (e as Error).message);
          failed++;
        }
      }),
    );
    return jsonOk({ sent, failed });
  } catch (e) {
    console.error(e);
    // Sempre 200 para não gerar loop / erro no trigger
    return jsonOk({ error: (e as Error).message });
  }
});

function jsonOk(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeInternalUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (!v.startsWith("/")) return null;
  if (v.startsWith("//")) return null;
  return v.slice(0, 300);
}

// ---------------------------------------------------------------------------
// Web Push (VAPID) implementation using Web Crypto (no external deps)
// ---------------------------------------------------------------------------
function b64uToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
function bytesToB64u(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

async function importVapidKey() {
  const d = b64uToBytes(VAPID_PRIV);
  const pub = b64uToBytes(VAPID_PUB); // 65 bytes uncompressed
  const jwk = {
    kty: "EC",
    crv: "P-256",
    d: VAPID_PRIV,
    x: bytesToB64u(pub.slice(1, 33)),
    y: bytesToB64u(pub.slice(33, 65)),
    ext: true,
  };
  // touch d to avoid unused
  void d;
  return await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function vapidHeaders(audience: string) {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 6,
    sub: VAPID_SUB,
  };
  const enc = (o: unknown) => bytesToB64u(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const key = await importVapidKey();
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(signingInput),
    ),
  );
  const jwt = `${signingInput}.${bytesToB64u(sig)}`;
  return {
    Authorization: `vapid t=${jwt}, k=${VAPID_PUB}`,
  };
}

// aes128gcm encryption per RFC 8291
async function encryptPayload(
  payload: Uint8Array,
  uaPublicRaw: Uint8Array,
  authSecret: Uint8Array,
): Promise<{ body: Uint8Array; }> {
  // Server ephemeral EC keypair
  const server = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", server.publicKey));

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublicRaw,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, server.privateKey, 256),
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF helper
  async function hkdf(
    ikm: Uint8Array,
    saltBytes: Uint8Array,
    info: Uint8Array,
    length: number,
  ): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: saltBytes, info },
      key,
      length * 8,
    );
    return new Uint8Array(bits);
  }

  // PRK_key = HKDF(auth_secret, ecdh_secret, key_info, 32)
  const keyInfo = concat(
    new TextEncoder().encode("WebPush: info\0"),
    uaPublicRaw,
    serverPubRaw,
  );
  const ikm = await hkdf(shared, authSecret, keyInfo, 32);

  // CEK = HKDF(salt, ikm, "Content-Encoding: aes128gcm\0", 16)
  const cek = await hkdf(
    ikm,
    salt,
    new TextEncoder().encode("Content-Encoding: aes128gcm\0"),
    16,
  );
  // NONCE = HKDF(salt, ikm, "Content-Encoding: nonce\0", 12)
  const nonce = await hkdf(
    ikm,
    salt,
    new TextEncoder().encode("Content-Encoding: nonce\0"),
    12,
  );

  // pad: payload || 0x02 (last record delimiter)
  const padded = concat(payload, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded),
  );

  // Build aes128gcm header: salt(16) || rs(4, uint32be = 4096) || idlen(1) || keyid(idlen)
  const rs = 4096;
  const rsBytes = new Uint8Array(4);
  new DataView(rsBytes.buffer).setUint32(0, rs, false);
  const header = concat(
    salt,
    rsBytes,
    new Uint8Array([serverPubRaw.length]),
    serverPubRaw,
  );
  const body = concat(header, cipher);
  return { body };
}

async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payloadStr: string,
): Promise<Response> {
  const uaPublic = b64uToBytes(sub.p256dh);
  const authSecret = b64uToBytes(sub.auth);
  const payload = new TextEncoder().encode(payloadStr);
  const { body } = await encryptPayload(payload, uaPublic, authSecret);

  const u = new URL(sub.endpoint);
  const aud = `${u.protocol}//${u.host}`;
  const vh = await vapidHeaders(aud);

  return await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      ...vh,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "2419200",
      "Content-Length": String(body.length),
    },
    body,
  });
}
