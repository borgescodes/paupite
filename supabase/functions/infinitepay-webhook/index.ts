import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, errorResponse, HttpError, json, writeAudit } from "../_shared/paupite.ts";

interface WebhookBody {
  invoice_slug?: string;
  slug?: string;
  amount?: number;
  paid_amount?: number;
  capture_method?: string;
  transaction_nsu?: string;
  order_nsu?: string;
  receipt_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const expectedToken = Deno.env.get("INFINITEPAY_WEBHOOK_TOKEN");
    const receivedToken = new URL(req.url).searchParams.get("token");
    if (!expectedToken || !receivedToken || !timingSafeEqual(expectedToken, receivedToken)) {
      throw new HttpError(401, "Invalid webhook token.");
    }

    const url = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const handle = Deno.env.get("INFINITEPAY_HANDLE");
    if (!url || !serviceRole || !handle)
      throw new HttpError(503, "Payment integration is not configured.");
    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json()) as WebhookBody;
    const orderNsu = body.order_nsu?.trim();
    const transactionNsu = body.transaction_nsu?.trim();
    const slug = (body.invoice_slug ?? body.slug)?.trim();
    if (!orderNsu || !transactionNsu || !slug) throw new HttpError(400, "Incomplete webhook.");

    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .select("*, enrollment:enrollment_id(id,user_id,status,pool_id)")
      .eq("order_nsu", orderNsu)
      .eq("provider", "infinitepay")
      .maybeSingle();
    if (paymentError) throw new HttpError(500, paymentError.message);
    if (!payment) throw new HttpError(404, "Payment not found.");
    if (payment.status === "paid") return json({ ok: true });
    if (["removed", "refund_pending"].includes(payment.enrollment?.status)) {
      throw new HttpError(409, "Enrollment was removed and must not be activated.");
    }
    const { data: settings, error: settingsError } = await admin
      .from("pool_settings")
      .select("entry_fee_cents")
      .eq("id", payment.enrollment.pool_id)
      .single();
    if (settingsError) throw new HttpError(500, settingsError.message);
    if (settings.entry_fee_cents !== payment.amount_cents) {
      throw new HttpError(400, "The pool entry fee changed; this checkout must not be activated.");
    }

    const checked = await checkPayment(handle, orderNsu, transactionNsu, slug);
    if (!checked.paid || checked.amount !== payment.amount_cents) {
      throw new HttpError(400, "Payment was not confirmed with the expected amount.");
    }

    const paidAt = new Date().toISOString();
    const { error: updateError } = await admin
      .from("payments")
      .update({
        status: "paid",
        transaction_nsu: transactionNsu,
        invoice_slug: slug,
        paid_amount_cents: checked.paid_amount ?? body.paid_amount ?? checked.amount,
        receipt_url: body.receipt_url ?? null,
        capture_method: checked.capture_method ?? body.capture_method ?? null,
        paid_at: paidAt,
      })
      .eq("id", payment.id)
      .eq("status", "pending");
    if (updateError) throw new HttpError(400, updateError.message);

    const { error: enrollmentError } = await admin
      .from("enrollments")
      .update({ status: "active", activated_at: paidAt })
      .eq("id", payment.enrollment_id);
    if (enrollmentError) throw new HttpError(400, enrollmentError.message);

    await writeAudit(
      admin,
      payment.enrollment?.user_id ?? null,
      "payment.confirmed",
      "payment",
      payment.id,
      {
        order_nsu: orderNsu,
        transaction_nsu: transactionNsu,
        amount_cents: checked.amount,
        source: "webhook+payment_check",
      },
    );
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
});

async function checkPayment(
  handle: string,
  orderNsu: string,
  transactionNsu: string,
  slug: string,
) {
  const response = await fetch("https://api.checkout.infinitepay.io/payment_check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      handle,
      order_nsu: orderNsu,
      transaction_nsu: transactionNsu,
      slug,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    paid?: boolean;
    amount?: number;
    paid_amount?: number;
    capture_method?: string;
  };
  if (!response.ok || !payload.success)
    throw new HttpError(502, "InfinitePay payment_check failed.");
  return payload;
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}
