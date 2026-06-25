import {
  authenticate,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  writeAudit,
} from "../_shared/paupite.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const { user, profile, admin } = await authenticate(req);
    const handle = Deno.env.get("INFINITEPAY_HANDLE")?.trim();
    const appUrl = Deno.env.get("APP_PUBLIC_URL")?.replace(/\/$/, "");
    const webhookToken = Deno.env.get("INFINITEPAY_WEBHOOK_TOKEN")?.trim();
    const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
    if (!handle || !appUrl || !webhookToken || !supabaseUrl) {
      throw new HttpError(
        503,
        "Pagamento automático ainda não foi configurado. Solicite confirmação manual ao superadmin.",
      );
    }

    const { data: settings, error: settingsError } = await admin
      .from("pool_settings")
      .select("*")
      .eq("slug", "world-cup-2026")
      .single();
    if (settingsError) throw new HttpError(500, settingsError.message);
    if (settings.status !== "open")
      throw new HttpError(400, "O bolão não está aberto para pagamento.");
    if (settings.entry_fee_cents <= 0)
      throw new HttpError(400, "Esta inscrição não exige pagamento.");

    const { data: enrollment, error: enrollmentError } = await admin
      .from("enrollments")
      .select("*")
      .eq("pool_id", settings.id)
      .eq("user_id", profile.id)
      .maybeSingle();
    if (enrollmentError) throw new HttpError(500, enrollmentError.message);
    if (!enrollment) throw new HttpError(400, "Solicite a inscrição e aceite os termos primeiro.");
    if (enrollment.status === "active") return json({ already_active: true });

    const { data: previous } = await admin
      .from("payments")
      .select("id,status,checkout_url,order_nsu")
      .eq("enrollment_id", enrollment.id)
      .eq("provider", "infinitepay")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previous?.checkout_url) {
      return json({ payment_id: previous.id, checkout_url: previous.checkout_url });
    }

    const orderNsu = `paupite-${crypto.randomUUID()}`;
    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .insert({
        enrollment_id: enrollment.id,
        provider: "infinitepay",
        status: "pending",
        amount_cents: settings.entry_fee_cents,
        order_nsu: orderNsu,
      })
      .select("id")
      .single();
    if (paymentError) throw new HttpError(400, paymentError.message);

    const checkoutPayload = {
      handle,
      order_nsu: orderNsu,
      items: [
        {
          quantity: 1,
          price: settings.entry_fee_cents,
          description: `Inscrição ${settings.title}`,
        },
      ],
      redirect_url: `${appUrl}/pool?payment=return`,
      webhook_url: `${supabaseUrl}/functions/v1/infinitepay-webhook?token=${encodeURIComponent(
        webhookToken,
      )}`,
      customer: {
        name: profile.display_name || profile.email.split("@")[0],
        email: user.email ?? profile.email,
      },
    };

    const response = await fetch("https://api.checkout.infinitepay.io/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkoutPayload),
    });
    const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const checkoutUrl = pickString(raw, ["url", "checkout_url", "link"]);
    const invoiceSlug = pickString(raw, ["slug", "invoice_slug"]);
    if (!response.ok || !checkoutUrl) {
      await admin.from("payments").update({ status: "failed" }).eq("id", payment.id);
      throw new HttpError(502, "Não foi possível criar o checkout InfinitePay.");
    }

    await admin
      .from("payments")
      .update({ checkout_url: checkoutUrl, invoice_slug: invoiceSlug })
      .eq("id", payment.id);
    await admin.from("enrollments").update({ status: "payment_pending" }).eq("id", enrollment.id);
    await writeAudit(admin, profile.id, "payment.checkout_created", "payment", payment.id, {
      order_nsu: orderNsu,
      amount_cents: settings.entry_fee_cents,
    });

    return json({ payment_id: payment.id, checkout_url: checkoutUrl });
  } catch (error) {
    return errorResponse(error);
  }
});

function pickString(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (typeof value[key] === "string" && value[key]) return value[key] as string;
  }
  const data = value.data;
  if (data && typeof data === "object") return pickString(data as Record<string, unknown>, keys);
  return null;
}
